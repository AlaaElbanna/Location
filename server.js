const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'locations.json');

// Initialize data file if it doesn't exist
if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, '[]');
}

// Write queue to prevent race conditions
const writeQueue = [];
let isWriting = false;

function saveLocationToFile(locationData) {
    return new Promise((resolve, reject) => {
        writeQueue.push({ locationData, resolve, reject });
        processQueue();
    });
}

function processQueue() {
    if (isWriting || writeQueue.length === 0) return;

    isWriting = true;
    const { locationData, resolve, reject } = writeQueue.shift();

    try {
        const existingData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        existingData.push(locationData);
        fs.writeFileSync(DATA_FILE, JSON.stringify(existingData, null, 2));
        console.log('Location saved:', locationData);
        resolve({ success: true, message: 'Location saved' });
    } catch (err) {
        console.error('Error saving location:', err);
        reject(err);
    } finally {
        isWriting = false;
        processQueue(); // Process next item in queue
    }
}

const server = http.createServer((req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    // Serve index.html
    if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
        fs.readFile(path.join(__dirname, 'index.html'), (err, data) => {
            if (err) {
                res.writeHead(500);
                res.end('Error loading page');
                return;
            }
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(data);
        });
        return;
    }

    // Save location endpoint
    if (req.method === 'POST' && req.url === '/api/save-location') {
        let body = '';

        req.on('data', chunk => {
            body += chunk.toString();
        });

        req.on('end', async () => {
            try {
                const locationData = JSON.parse(body);

                // Add IP address and server timestamp
                locationData.ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
                locationData.savedAt = new Date().toISOString();

                // Save using queue to prevent race conditions
                const result = await saveLocationToFile(locationData);

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(result));
            } catch (err) {
                console.error('Error saving location:', err);
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: 'Invalid data' }));
            }
        });
        return;
    }

    // Get all locations endpoint (for viewing saved data)
    if (req.method === 'GET' && req.url === '/api/locations') {
        try {
            const data = fs.readFileSync(DATA_FILE, 'utf8');
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(data);
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Could not read locations' }));
        }
        return;
    }

    // 404 for other routes
    res.writeHead(404);
    res.end('Not found');
});

server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`Locations will be saved to: ${DATA_FILE}`);
});