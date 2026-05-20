const https = require('https');

function sendTelegram(botToken, chatId, text) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify({
            chat_id: chatId,
            text: text,
            disable_web_page_preview: true
        });
        const req = https.request({
            method: 'POST',
            hostname: 'api.telegram.org',
            path: `/bot${botToken}/sendMessage`,
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body)
            },
            timeout: 5000
        }, (res) => {
            let data = '';
            res.on('data', (c) => (data += c));
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) resolve(data);
                else reject(new Error(`Telegram HTTP ${res.statusCode}: ${data}`));
            });
        });
        req.on('error', reject);
        req.on('timeout', () => req.destroy(new Error('telegram timeout')));
        req.write(body);
        req.end();
    });
}

module.exports = { sendTelegram };
