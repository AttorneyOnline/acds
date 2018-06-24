const WebSocket = require('ws');

class MockClient {
    async connect() {
        this.ws = new WebSocket(`ws://127.0.0.1:${PORT}/`);
        return new Promise(resolve => {
            this.ws.addEventListener('open', () => resolve());
        });
    }

    async disconnect() {
        this.ws.close();
    }

    
}

module.exports = MockClient;