require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const OIDCStrategy = require('passport-azure-ad').OIDCStrategy;
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const axios = require('axios');
const { BlobServiceClient } = require('@azure/storage-blob');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: 'your_secret_key',
  resave: false,
  saveUninitialized: true
}));

passport.use(new OIDCStrategy({
  identityMetadata: `https://login.microsoftonline.com/${process.env.TENANT_ID}/v2.0/.well-known/openid-configuration`,
  clientID: process.env.CLIENT_ID,
  responseType: 'code id_token',
  responseMode: 'form_post',
  redirectUrl: 'http://localhost:3000/auth/openid/return',
  allowHttpForRedirectUrl: true,
  clientSecret: process.env.CLIENT_SECRET,
  validateIssuer: false,
  passReqToCallback: false,
  scope: ['profile', 'offline_access', 'https://graph.microsoft.com/mail.read']
}, function(iss, sub, profile, accessToken, refreshToken, done) {
  return done(null, profile);
}));

app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((obj, done) => {
  done(null, obj);
});

app.get('/login', passport.authenticate('azuread-openidconnect', {
  failureRedirect: '/'
}));

app.post('/auth/openid/return',
  passport.authenticate('azuread-openidconnect', { failureRedirect: '/' }),
  (req, res) => {
    res.redirect('/');
  }
);

app.get('/logout', (req, res) => {
  req.logout();
  res.redirect('/');
});

const blobServiceClient = BlobServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING);

app.post('/create-checkout-session', async (req, res) => {
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [{
      price_data: {
        currency: 'usd',
        product_data: {
          name: 'Greeting Card Subscription',
        },
        unit_amount: 1700,
      },
      quantity: 1,
    }],
    mode: 'subscription',
    success_url: 'http://localhost:3000/success',
    cancel_url: 'http://localhost:3000/cancel',
  });

  res.json({ id: session.id });
});

app.post('/generate-card', async (req, res) => {
  const { description, template } = req.body;
  console.log('Received request to generate card:', { description, template });

  try {
    const response = await axios.post('https://api.openai.com/v1/images', {
      prompt: `${template}: ${description}`,
      n: 1,
      size: '1024x1024'
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      }
    });

    console.log('Response from OpenAI:', response.data);

    const imageUrl = response.data.data[0].url;
    console.log('Generated image URL:', imageUrl);

    const containerClient = blobServiceClient.getContainerClient('generated-cards');
    const blockBlobClient = containerClient.getBlockBlobClient(`${Date.now()}.png`);

    await blockBlobClient.uploadStream(imageUrl, {
      bufferSize: 4 * 1024 * 1024,
      maxBuffers: 20
    });

    res.json({ imageUrl: blockBlobClient.url });
  } catch (error) {
    console.error('Error generating card:', error.response ? error.response.data : error.message);
    res.status(500).send('Error generating card');
  }
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
