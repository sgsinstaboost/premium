export default async function handler(req, res) {
    // Enable CORS for Vercel Serverless Function
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { service, link, quantity } = req.body;

        if (!service || !link || !quantity) {
            return res.status(400).json({ error: 'Missing required params' });
        }

        // Secure Aapkaprovider API Key
        const API_KEY = "ad7b6ed8b9e332b2f4b9c4840e0fb7db";
        
        const params = new URLSearchParams();
        params.append('key', API_KEY);
        params.append('action', 'add');
        params.append('service', service);
        params.append('link', link);
        params.append('quantity', quantity);

        const response = await fetch('https://aapkaprovider.com/api/v2', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: params.toString()
        });

        const data = await response.json();
        return res.status(200).json(data);

    } catch (error) {
        console.error("Vercel Serverless Order Error:", error);
        return res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
}
