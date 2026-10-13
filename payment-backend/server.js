require('dotenv').config();

const express = require('express');
const cors = require('cors');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const serviceAccount = require('./firebase-service-account.json');
if (!getApps().length) initializeApp({ credential: cert(serviceAccount) });
const firebaseAdminAuth = getAuth();
const unlockFile = path.join(__dirname, 'unlocked-courses.json');
function readUnlocks() { try { return JSON.parse(fs.readFileSync(unlockFile, 'utf8')); } catch { return {}; } }
function saveUnlocks(data) { fs.writeFileSync(unlockFile, JSON.stringify(data, null, 2)); }

const app = express();

app.use(cors());
app.use(express.json());

const keyId = process.env.RAZORPAY_KEY_ID;
const keySecret = process.env.RAZORPAY_KEY_SECRET;

if (!keyId || !keySecret) {
  console.error('Razorpay keys are missing from .env');
  process.exit(1);
}

const razorpay = new Razorpay({
  key_id: keyId,
  key_secret: keySecret,
});

app.use(express.static(require('path').join(__dirname,'public')));

app.get('/', (req, res) => {
  res.json({
    app: 'STUDY WITH VEER Payment Backend',
    status: 'running',
  });
});

app.get('/payment-status', (req, res) => {
  res.json({
    testMode: keyId.startsWith('rzp_test_'),
    message: 'Payment backend is configured',
  });
});


async function getAuthenticatedUser(req) {
  const header = req.get('authorization') || '';
  if (!header.startsWith('Bearer ')) return null;
  try {
    return await firebaseAdminAuth.verifyIdToken(header.slice(7));
  } catch {
    return null;
  }
}

const orderFile = path.join(__dirname, 'payment-orders.json');

function readOrders() {
  try {
    return JSON.parse(fs.readFileSync(orderFile, 'utf8'));
  } catch {
    return {};
  }
}

function saveOrders(data) {
  fs.writeFileSync(orderFile, JSON.stringify(data, null, 2));
}

app.post('/create-order', async (req, res) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return res.status(401).json({ error: 'Please log in again.' });
    }

    if (!['ssc-reasoning-masterclass', 'ssc-general-awareness'].includes(req.body.courseId)) {
      return res.status(400).json({ error: 'Invalid course selection' });
    }

    const amount = 4900;
    const currency = 'INR';

    const order = await razorpay.orders.create({
      amount,
      currency,
      receipt: 'veer_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex'),
    });

    const orders = readOrders();
    orders[order.id] = {
      uid: user.uid,
      courseId: req.body.courseId,
      amount,
      currency,
      createdAt: new Date().toISOString(),
    };
    saveOrders(orders);

    return res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId,
    });
  } catch (error) {
    console.error('Order creation failed:', error.message);
    return res.status(500).json({ error: 'Could not create order' });
  }
});

app.post('/verify-payment', async (req, res) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return res.status(401).json({ verified: false, error: 'Please log in again.' });
    }

    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ verified: false });
    }

    const record = readOrders()[razorpay_order_id];

    if (!record || record.uid !== user.uid) {
      return res.status(403).json({
        verified: false,
        error: 'Order does not belong to this account.',
      });
    }

    const expectedSignature = crypto
      .createHmac('sha256', keySecret)
      .update(razorpay_order_id + '|' + razorpay_payment_id)
      .digest();

    let received;
    try {
      received = Buffer.from(razorpay_signature, 'hex');
    } catch {
      return res.status(400).json({ verified: false });
    }

    if (
      received.length !== expectedSignature.length ||
      !crypto.timingSafeEqual(received, expectedSignature)
    ) {
      return res.status(400).json({ verified: false });
    }

    const payment = await razorpay.payments.fetch(razorpay_payment_id);

    if (
      payment.order_id !== razorpay_order_id ||
      payment.amount !== record.amount ||
      payment.currency !== record.currency ||
      payment.status !== 'captured'
    ) {
      return res.status(400).json({
        verified: false,
        error: 'Payment is not confirmed as captured.',
      });
    }

    const unlocks = readUnlocks();
    const existing = unlocks[user.uid] || {};
    const courses = existing.courses || {};

    courses[record.courseId] = {
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      unlockedAt: new Date().toISOString(),
    };

    unlocks[user.uid] = { ...existing, courses };
    saveUnlocks(unlocks);

    return res.json({
      verified: true,
      unlocked: true,
      courseId: record.courseId,
    });
  } catch (error) {
    console.error('Payment verification failed:', error.message);
    return res.status(500).json({
      verified: false,
      error: 'Could not confirm payment status.',
    });
  }
});


app.get('/my-courses', async (req, res) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return res.status(401).json({ error: 'Please log in again.' });
    }

    const unlocks = readUnlocks();
    return res.json({
      courses: (unlocks[user.uid] && unlocks[user.uid].courses) || {},
    });
  } catch (error) {
    console.error('Course access lookup failed:', error.message);
    return res.status(500).json({ error: 'Could not load course access.' });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Payment backend running on port ${PORT}`);
});
