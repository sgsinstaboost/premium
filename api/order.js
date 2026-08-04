export default async function handler(req, res) {
  // CORS Headers allow karte hain taaki tumhari HTML site se call ho sake
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
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const API_KEY = process.env.AAPKA_PROVIDER_KEY;
    const body = req.body || {};

    const formData = new URLSearchParams();
    formData.append('key', API_KEY);
    formData.append('action', body.action || 'add');
    if (body.service) formData.append('service', body.service);
    if (body.link) formData.append('link', body.link);
    if (body.quantity) formData.append('quantity', body.quantity);

    const response = await fetch('https://aapkaprovider.com/api/v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });

    const data = await response.json();
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Server error' });
  }
}
