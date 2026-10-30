require('dotenv').config();

const express = require('express');
const { createClient } = require("@supabase/supabase-js");
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;
if (!supabaseUrl || !supabaseSecretKey) {
  console.error('Supabase server environment variables are missing.');
  process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseSecretKey);

const cors = require('cors');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
function loadServiceAccount() {
  const encoded = process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64;
  const raw = encoded
    ? Buffer.from(encoded, 'base64').toString('utf8')
    : process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (!raw) {
    throw new Error('Firebase service account environment variables are missing');
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('Firebase service account environment variable contains invalid JSON');
  }
}

const serviceAccount = loadServiceAccount();
if (!getApps().length) initializeApp({ credential: cert(serviceAccount) });
const firebaseAdminAuth = getAuth();
const unlockFile = path.join(__dirname, 'unlocked-courses.json');
function readUnlocks() { try { return JSON.parse(fs.readFileSync(unlockFile, 'utf8')); } catch { return {}; } }
function saveUnlocks(data) { fs.writeFileSync(unlockFile, JSON.stringify(data, null, 2)); }

async function hasActiveCoursePurchase(userId, courseId) {
  const packSubjects = {
    'ssc-all-subjects-pack': [
      'ssc-mathematics',
      'ssc-reasoning-masterclass',
      'ssc-general-awareness',
      'ssc-english-foundation'
    ],
    'rrb-ntpc-all-subjects-pack': [
      'rrb-ntpc-mathematics',
      'rrb-ntpc-reasoning',
      'rrb-ntpc-general-science',
      'rrb-ntpc-general-awareness'
    ],
    'rrb-group-d-all-subjects-pack': [
      'rrb-group-d-mathematics',
      'rrb-group-d-reasoning',
      'rrb-group-d-general-science',
      'rrb-group-d-general-awareness'
    ],
    'rrb-alp-all-subjects-pack': [
      'rrb-alp-mathematics',
      'rrb-alp-reasoning',
      'rrb-alp-general-science',
      'rrb-alp-general-awareness'
    ],
    'rrb-technician-all-subjects-pack': [
      'rrb-technician-mathematics',
      'rrb-technician-reasoning',
      'rrb-technician-general-science',
      'rrb-technician-general-awareness'
    ]
  };

  const isPack = Object.prototype.hasOwnProperty.call(packSubjects, courseId);

  try {
    const { data, error } = await supabase
      .from('course_purchases')
      .select('purchase_date, expires_at, validity_months')
      .eq('user_id', userId)
      .eq('course_id', courseId);

    if (error) throw error;

    const directActive = (data || []).some(row => isCourseActive({
      purchaseDate: row.purchase_date,
      unlockedAt: row.purchase_date,
      expiresAt: row.expires_at,
      validityMonths: row.validity_months || 6
    }));

    if (directActive) return true;

    // If Supabase has no record, safely check the existing local fallback.
    if (!data || data.length === 0) {
      const unlocks = readUnlocks();
      const courses = (unlocks[userId] && unlocks[userId].courses) || {};
      if (isCourseActive(courses[courseId])) return true;
    }

    if (isPack) return false;

    const packId = Object.keys(packSubjects).find(id =>
      packSubjects[id].includes(courseId)
    );

    return packId ? hasActiveCoursePurchase(userId, packId) : false;
  } catch (error) {
    console.error('Supabase purchase verification failed:', error.message);
    const unlocks = readUnlocks();
    const courses = (unlocks[userId] && unlocks[userId].courses) || {};
    const directActive = isCourseActive(courses[courseId]);

    if (directActive || isPack) return directActive;

    const packId = Object.keys(packSubjects).find(id =>
      packSubjects[id].includes(courseId)
    );

    if (!packId) return false;

    const packActive = isCourseActive(courses[packId]);
    return packActive;
  }
}

async function saveCoursePurchaseToSupabase(userId, courseId, purchase) {
  const { error } = await supabase
    .from('course_purchases')
    .upsert({
      user_id: userId,
      course_id: courseId,
      order_id: purchase.orderId,
      payment_id: purchase.paymentId,
      purchase_date: purchase.purchaseDate || purchase.unlockedAt,
      expires_at: purchase.expiresAt,
      validity_months: purchase.validityMonths || 6
    }, { onConflict: 'user_id,course_id' });

  if (error) throw error;
}


// Course validity: six calendar months from the purchase date.
function addSixMonths(value) {
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return null;
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + 6);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return d;
}
function courseExpiry(purchase) {
  if (!purchase) return null;
  if (purchase.expiresAt) {
    const saved = new Date(purchase.expiresAt);
    if (Number.isFinite(saved.getTime())) return saved;
  }
  const start = purchase.unlockedAt || purchase.purchaseDate;
  return start ? addSixMonths(start) : null;
}
function isCourseActive(purchase) {
  const expiry = courseExpiry(purchase);
  return !!expiry && Date.now() < expiry.getTime();
}

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
  } catch (error) {
    console.error('Firebase token verification failed:', error.code || error.name || 'unknown');
    return null;
  }
}




app.post('/auth/native-phone-custom-token', async (req, res) => {
  const idToken = typeof req.body?.idToken === 'string'
    ? req.body.idToken.trim()
    : '';

  if (!idToken) {
    return res.status(400).json({ error: 'Missing Firebase ID token.' });
  }

  try {
    const decoded = await firebaseAdminAuth.verifyIdToken(idToken, true);
    const provider = decoded.firebase?.sign_in_provider;

    if (provider !== 'phone' || !decoded.phone_number) {
      return res.status(403).json({
        error: 'Please verify your mobile number using Phone OTP.'
      });
    }

    const customToken = await firebaseAdminAuth.createCustomToken(decoded.uid);
    return res.json({ customToken });
  } catch (error) {
    console.error('Native phone token exchange failed:', error.code || error.name || 'unknown');
    return res.status(401).json({ error: 'Phone verification failed. Please try again.' });
  }
});

const firebaseAdminDb = getFirestore();

const announcementImageTypes = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp'
};

app.post('/notifications/upload-photo',
  express.raw({ type: Object.keys(announcementImageTypes), limit: '5mb' }),
  async (req, res) => {
    const user = await getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Please log in first.' });

    const adminUids = (process.env.ADMIN_UIDS || '').split(',').map(x => x.trim()).filter(Boolean);
    if (!adminUids.includes(user.uid)) {
      return res.status(403).json({ error: 'Admin permission required.' });
    }

    const contentType = req.get('content-type') || '';
    const extension = announcementImageTypes[contentType];
    if (!extension || !Buffer.isBuffer(req.body) || !req.body.length) {
      return res.status(400).json({ error: 'Please upload a valid JPEG, PNG, or WebP photo.' });
    }

    try {
      const objectPath = 'announcements/' + crypto.randomUUID() + '.' + extension;
      const { error } = await supabase.storage
        .from('announcements-media')
        .upload(objectPath, req.body, {
          contentType,
          upsert: false
        });

      if (error) throw error;
      return res.json({ uploaded: true, attachmentPath: objectPath, attachmentType: contentType });
    } catch (error) {
      console.error('Announcement photo upload failed:', error.message);
      return res.status(500).json({ error: 'Could not upload announcement photo.' });
    }
  }
);

app.get('/notifications/:notificationId/photo-url', async (req, res) => {
  const user = await getAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: 'Please log in first.' });

  try {
    const notification = await firebaseAdminDb
      .collection('users').doc(user.uid)
      .collection('notifications').doc(req.params.notificationId).get();

    if (!notification.exists) {
      return res.status(404).json({ error: 'Notification not found.' });
    }

    const attachmentPath = notification.data().attachmentPath;
    if (typeof attachmentPath !== 'string' || !attachmentPath.startsWith('announcements/')) {
      return res.status(404).json({ error: 'This notification has no photo.' });
    }

    const { data, error } = await supabase.storage
      .from('announcements-media')
      .createSignedUrl(attachmentPath, 3600);

    if (error) throw error;
    return res.json({ url: data.signedUrl });
  } catch (error) {
    console.error('Announcement photo URL failed:', error.message);
    return res.status(500).json({ error: 'Could not load announcement photo.' });
  }
});


app.post('/notifications/register-token', async (req, res) => {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Please log in first.' });
  }

  const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
  if (!/^Expo(nent)?PushToken\[[^\]]+\]$/.test(token)) {
    return res.status(400).json({ error: 'Invalid Expo push token.' });
  }

  try {
    const tokenId = crypto.createHash('sha256').update(token).digest('hex');
    await firebaseAdminDb
      .collection('users').doc(user.uid)
      .collection('pushTokens').doc(tokenId)
      .set({
        token,
        platform: 'android',
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });

    return res.json({ registered: true });
  } catch (error) {
    console.error('Push token registration failed:', error.message);
    return res.status(500).json({ error: 'Could not register push token.' });
  }
});


app.get('/notifications/admin-status', async (req, res) => {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Please log in first.' });
  }

  const adminUids = (process.env.ADMIN_UIDS || '')
    .split(',')
    .map(uid => uid.trim())
    .filter(Boolean);

  return res.json({ isAdmin: adminUids.includes(user.uid) });
});

app.post('/notifications/send', async (req, res) => {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Please log in first.' });
  }

  const adminUids = (process.env.ADMIN_UIDS || '')
    .split(',')
    .map(uid => uid.trim())
    .filter(Boolean);

  if (!adminUids.length || !adminUids.includes(user.uid)) {
    return res.status(403).json({ error: 'Admin permission required.' });
  }

  const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
  const body = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
  const attachmentPath = typeof req.body?.attachmentPath === 'string'
    ? req.body.attachmentPath.trim()
    : '';
  const attachmentType = typeof req.body?.attachmentType === 'string'
    ? req.body.attachmentType.trim()
    : '';

  if (
    attachmentPath &&
    (!attachmentPath.startsWith('announcements/') ||
      !['image/jpeg', 'image/png', 'image/webp'].includes(attachmentType))
  ) {
    return res.status(400).json({ error: 'Invalid announcement photo attachment.' });
  }

  if (!title || title.length > 80 || !body || body.length > 300) {
    return res.status(400).json({
      error: 'Title is required (max 80 characters) and message is required (max 300 characters).'
    });
  }

  try {
    const messages = [];
    let notifiedUsers = 0;
    let authUsersChecked = 0;
    let nextPageToken;

    do {
      const page = await firebaseAdminAuth.listUsers(1000, nextPageToken);
      nextPageToken = page.pageToken;

      for (const authUser of page.users) {
        authUsersChecked++;
        const userRef = firebaseAdminDb.collection('users').doc(authUser.uid);
        const notificationRef = userRef.collection('notifications').doc();

        await notificationRef.set({
          title,
          body,
          createdAt: FieldValue.serverTimestamp(),
          readAt: null,
          type: 'admin',
          ...(attachmentPath ? { attachmentPath, attachmentType } : {})
        });

        notifiedUsers++;

        const tokensSnapshot = await userRef.collection('pushTokens').get();
        for (const tokenDoc of tokensSnapshot.docs) {
          const token = tokenDoc.data().token;
          if (typeof token === 'string' && /^Expo(nent)?PushToken\[[^\]]+\]$/.test(token)) {
            messages.push({
              to: token,
              sound: 'default',
              title,
              body,
              data: { type: 'admin-notification' }
            });
          }
        }
      }
    } while (nextPageToken);

    let pushAccepted = 0;
    let pushErrors = 0;

    for (let i = 0; i < messages.length; i += 100) {
      const chunk = messages.slice(i, i + 100);
      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(chunk)
      });

      if (!response.ok) {
        pushErrors += chunk.length;
        continue;
      }

      const result = await response.json();
      for (const ticket of (result.data || [])) {
        if (ticket.status === 'ok') pushAccepted++;
        else pushErrors++;
      }
    }

    return res.json({
      sent: true,
      authUsersChecked,
      notifiedUsers,
      registeredTokens: messages.length,
      pushAccepted,
      pushErrors
    });
  } catch (error) {
    console.error('Admin notification send failed:', error.message);
    return res.status(500).json({ error: 'Could not send notification.' });
  }
});

const checkoutSessionSecret = process.env.CHECKOUT_SESSION_SECRET;

if (!checkoutSessionSecret || checkoutSessionSecret.length < 64) {
  console.error('CHECKOUT_SESSION_SECRET is missing or invalid.');
  process.exit(1);
}

const allowedCheckoutCourses = new Set([

  'tgpsc-group-1-english',
  'tgpsc-group-1-mathematics',
  'tgpsc-group-1-reasoning',
  'tgpsc-group-1-telangana-movement',
  'tgpsc-group-1-telangana-history',
  'tgpsc-group-1-telangana-geography',
  'tgpsc-group-1-telangana-economy',
  'tgpsc-group-1-general-awareness',
  'tgpsc-group-2-english',
  'tgpsc-group-2-mathematics',
  'tgpsc-group-2-reasoning',
  'tgpsc-group-2-telangana-movement',
  'tgpsc-group-2-telangana-history',
  'tgpsc-group-2-telangana-geography',
  'tgpsc-group-2-telangana-economy',
  'tgpsc-group-2-general-awareness',
  'tgpsc-group-3-english',
  'tgpsc-group-3-mathematics',
  'tgpsc-group-3-reasoning',
  'tgpsc-group-3-telangana-movement',
  'tgpsc-group-3-telangana-history',
  'tgpsc-group-3-telangana-geography',
  'tgpsc-group-3-telangana-economy',
  'tgpsc-group-3-general-awareness',
  'tgpsc-group-4-english',
  'tgpsc-group-4-mathematics',
  'tgpsc-group-4-reasoning',
  'tgpsc-group-4-telangana-movement',
  'tgpsc-group-4-telangana-history',
  'tgpsc-group-4-telangana-geography',
  'tgpsc-group-4-telangana-economy',
  'tgpsc-group-4-general-awareness',
  'ssc-reasoning-masterclass',
  'ssc-general-awareness',
  'ssc-english-foundation',
  'ssc-mathematics',
  'ssc-all-subjects-pack',
  'rrb-ntpc-reasoning',
  'rrb-ntpc-mathematics',
  'rrb-ntpc-general-science',
  'rrb-ntpc-general-awareness',
  'rrb-group-d-reasoning',
  'rrb-group-d-mathematics',
  'rrb-group-d-general-science',
  'rrb-group-d-general-awareness',
  'rrb-alp-reasoning',
  'rrb-alp-mathematics',
  'rrb-alp-general-science',
  'rrb-alp-general-awareness',
  'rrb-technician-reasoning',
  'rrb-technician-mathematics',
  'rrb-technician-general-science',
  'rrb-technician-general-awareness',
  'rrb-ntpc-all-subjects-pack',
  'rrb-group-d-all-subjects-pack',
  'rrb-alp-all-subjects-pack',
  'rrb-technician-all-subjects-pack'
]);

function createCheckoutSessionToken(uid, courseId) {
  const payload = Buffer.from(JSON.stringify({
    uid,
    courseId,
    expiresAt: Date.now() + 15 * 60 * 1000,
    nonce: crypto.randomBytes(16).toString('hex')
  })).toString('base64url');

  const signature = crypto
    .createHmac('sha256', checkoutSessionSecret)
    .update(payload)
    .digest('base64url');

  return payload + '.' + signature;
}

function readCheckoutSession(token) {
  if (typeof token !== 'string' || token.length > 4096) return null;

  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const expected = crypto
    .createHmac('sha256', checkoutSessionSecret)
    .update(parts[0])
    .digest();

  const received = Buffer.from(parts[1], 'base64url');

  if (
    received.length !== expected.length ||
    !crypto.timingSafeEqual(received, expected)
  ) return null;

  try {
    const session = JSON.parse(
      Buffer.from(parts[0], 'base64url').toString('utf8')
    );

    if (
      typeof session.uid !== 'string' ||
      !session.uid ||
      !allowedCheckoutCourses.has(session.courseId) ||
      !Number.isFinite(session.expiresAt) ||
      session.expiresAt <= Date.now()
    ) return null;

    return session;
  } catch {
    return null;
  }
}

app.post('/create-checkout-session', async (req, res) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return res.status(401).json({ error: 'Please log in again.' });
    }

    const courseId = req.body && req.body.courseId;
    if (!allowedCheckoutCourses.has(courseId)) {
      return res.status(400).json({ error: 'Invalid course selection' });
    }

    const sessionToken = createCheckoutSessionToken(user.uid, courseId);
    return res.json({ sessionToken, expiresIn: 900 });
  } catch (error) {
    console.error('Checkout session creation failed:', error.message);
    return res.status(500).json({ error: 'Could not start checkout.' });
  }
});

async function getPaymentUser(req) {
  const firebaseUser = await getAuthenticatedUser(req);
  if (firebaseUser) {
    return { user: firebaseUser, sessionCourseId: null };
  }

  const token = req.get('x-checkout-session') || '';
  const session = readCheckoutSession(token);

  if (!session) return null;

  return {
    user: { uid: session.uid },
    sessionCourseId: session.courseId
  };
}

app.get('/checkout-session-info', (req, res) => {
  const token = req.get('x-checkout-session') || '';
  const session = readCheckoutSession(token);

  if (!session) {
    return res.status(401).json({
      error: 'Checkout session expired. Return to the app and try again.'
    });
  }

  return res.json({ courseId: session.courseId });
});


app.post('/create-upi-qr', async (req, res) => {
  let createdQr = null;

  try {
    const auth = await getPaymentUser(req);
    const user = auth && auth.user;
    const courseId = req.body && req.body.courseId;

    if (!user) {
      return res.status(401).json({ error: 'Please log in again.' });
    }

    if (auth.sessionCourseId && courseId !== auth.sessionCourseId) {
      return res.status(403).json({ error: 'Checkout session course mismatch.' });
    }

    if (!allowedCheckoutCourses.has(courseId)) {
      return res.status(400).json({ error: 'Invalid course selection.' });
    }

    const amount = (
      courseId === 'ssc-all-subjects-pack' ||
      courseId.endsWith('-all-subjects-pack')
    ) ? 14900 : 4900;

    const closeBy = Math.floor(Date.now() / 1000) + 1800;

    createdQr = await razorpay.qrCode.create({
      type: 'upi_qr',
      usage: 'single_use',
      fixed_amount: true,
      payment_amount: amount,
      name: 'STUDY WITH VEER',
      description: 'Course purchase: ' + courseId,
      close_by: closeBy,
      notes: {
        user_id: user.uid,
        course_id: courseId
      }
    });

    const { error } = await supabase.from('upi_qr_orders').insert({
      qr_code_id: createdQr.id,
      user_id: user.uid,
      course_id: courseId,
      amount,
      currency: 'INR',
      status: 'created'
    });

    if (error) {
      try {
        await razorpay.qrCode.close(createdQr.id);
      } catch (_) {}
      throw error;
    }

    return res.json({
      qrCodeId: createdQr.id,
      imageUrl: createdQr.image_url,
      amount,
      currency: 'INR',
      closeBy
    });
  } catch (error) {
    console.error('UPI QR creation failed:', error.message);
    return res.status(500).json({ error: 'Could not create UPI QR.' });
  }
});

app.post('/upi-qr-status', async (req, res) => {
  try {
    const auth = await getPaymentUser(req);
    const user = auth && auth.user;
    const qrCodeId = req.body && req.body.qrCodeId;

    if (!user) {
      return res.status(401).json({ error: 'Please log in again.' });
    }

    if (typeof qrCodeId !== 'string' || !qrCodeId.startsWith('qr_')) {
      return res.status(400).json({ error: 'Invalid QR code ID.' });
    }

    const { data: qrOrder, error } = await supabase
      .from('upi_qr_orders')
      .select('*')
      .eq('qr_code_id', qrCodeId)
      .eq('user_id', user.uid)
      .maybeSingle();

    if (error) throw error;
    if (!qrOrder) {
      return res.status(404).json({ error: 'QR order not found.' });
    }

    if (auth.sessionCourseId && qrOrder.course_id !== auth.sessionCourseId) {
      return res.status(403).json({ error: 'Checkout session course mismatch.' });
    }

    if (qrOrder.status === 'paid') {
      return res.json({ status: 'paid', courseId: qrOrder.course_id });
    }

    if (qrOrder.status !== 'created') {
      return res.json({ status: qrOrder.status });
    }

    // Razorpay API is the authority for payment confirmation.
    const paymentList = await razorpay.qrCode.fetchAllPayments(qrCodeId, {
      count: 100
    });

    const payment = (paymentList.items || []).find(item =>
      item &&
      item.status === 'captured' &&
      item.captured === true &&
      Number(item.amount) === Number(qrOrder.amount) &&
      item.currency === qrOrder.currency &&
      item.method === 'upi'
    );

    if (payment) {
      const purchaseDate = new Date(Number(payment.created_at) * 1000);

      if (!Number.isFinite(purchaseDate.getTime())) {
        throw new Error('Invalid Razorpay payment timestamp.');
      }

      const expiryDate = addSixMonths(purchaseDate);
      if (!expiryDate) {
        throw new Error('Could not calculate course expiry.');
      }

      const { data: confirmed, error: rpcError } = await supabase.rpc(
        'confirm_upi_qr_payment',
        {
          p_qr_code_id: qrCodeId,
          p_payment_id: payment.id,
          p_purchase_date: purchaseDate.toISOString(),
          p_expires_at: expiryDate.toISOString()
        }
      );

      if (rpcError) throw rpcError;

      if (confirmed === true) {
        return res.json({
          status: 'paid',
          courseId: qrOrder.course_id
        });
      }
    }

    const qrDetails = await razorpay.qrCode.fetch(qrCodeId);

    if (qrDetails.status === 'closed') {
      await supabase
        .from('upi_qr_orders')
        .update({ status: 'expired' })
        .eq('qr_code_id', qrCodeId)
        .eq('user_id', user.uid)
        .eq('status', 'created');

      return res.json({ status: 'expired' });
    }

    return res.json({ status: 'pending' });
  } catch (error) {
    console.error('UPI QR status check failed:', error.message);
    return res.status(503).json({
      error: 'Could not verify payment right now. Please try again.'
    });
  }
});

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
    const auth = await getPaymentUser(req);
    const user = auth && auth.user;
    if (!user) {
      return res.status(401).json({ error: 'Please log in again.' });
    }

    if (auth.sessionCourseId && req.body.courseId !== auth.sessionCourseId) {
      return res.status(403).json({ error: 'Checkout session course mismatch.' });
    }
    if (!allowedCheckoutCourses.has(req.body.courseId)) {
      return res.status(400).json({ error: 'Invalid course selection' });
    }

    const amount = (req.body.courseId === 'ssc-all-subjects-pack' || req.body.courseId.endsWith('-all-subjects-pack')) ? 14900 : 4900;
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
    const auth = await getPaymentUser(req);
    const user = auth && auth.user;
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

    if (auth.sessionCourseId && record.courseId !== auth.sessionCourseId) {
      return res.status(403).json({
        verified: false,
        error: 'Checkout session course mismatch.',
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

    const purchaseDate = new Date().toISOString();
    const expiryDate = addSixMonths(purchaseDate);
    const purchase = {
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      unlockedAt: purchaseDate,
      purchaseDate,
      expiresAt: expiryDate.toISOString(),
      validityMonths: 6,
    };

    courses[record.courseId] = purchase;
    unlocks[user.uid] = { ...existing, courses };
    saveUnlocks(unlocks);

    try {
      await saveCoursePurchaseToSupabase(user.uid, record.courseId, purchase);
      console.log('Course purchase saved to Supabase:', record.courseId);
    } catch (dbError) {
      console.error('Supabase purchase save failed; local fallback saved:', dbError.message);
    }

    // Notifications are best-effort: they must not undo a verified payment.
    try {
      const courseNames = {
        'ssc-reasoning-masterclass': 'SSC Reasoning Masterclass',
        'ssc-general-awareness': 'SSC General Awareness',
        'ssc-english-foundation': 'SSC English Foundation',
        'ssc-mathematics': 'SSC Mathematics',
        'ssc-all-subjects-pack': 'SSC All Subjects Pack',
      };
      const courseName = courseNames[record.courseId] || record.courseId;
      let studentName = user.name || user.displayName || '';
      try {
        const studentAuth = await firebaseAdminAuth.getUser(user.uid);
        studentName = studentAuth.displayName || studentName || studentAuth.email || '';
      } catch (nameError) {
        console.error('Could not fetch student name:', nameError.message);
      }
      if (!studentName) studentName = 'Student';
      const studentRef = firebaseAdminDb.collection('users').doc(user.uid);
      const paymentNotificationId = 'purchase_' + razorpay_payment_id;

      const studentNotificationRef = studentRef.collection('notifications').doc(paymentNotificationId);
      const studentNotification = await studentNotificationRef.get();

      if (!studentNotification.exists) {
        await studentNotificationRef.create({
          title: 'Purchase successful',
          body: 'Your purchase of ' + courseName + ' is confirmed. Your course is unlocked.',
          createdAt: FieldValue.serverTimestamp(),
          readAt: null,
          type: 'purchase',
          courseId: record.courseId,
          paymentId: razorpay_payment_id,
        });
      }

      const adminUids = (process.env.ADMIN_UIDS || '')
        .split(',')
        .map(uid => uid.trim())
        .filter(Boolean);

      for (const adminUid of adminUids) {
        if (adminUid === user.uid) continue;

        const adminNotificationRef = firebaseAdminDb.collection('users').doc(adminUid)
          .collection('notifications').doc(paymentNotificationId + '_' + user.uid);
        const adminNotification = await adminNotificationRef.get();

        if (!adminNotification.exists) {
          await adminNotificationRef.create({
            title: 'New course purchase',
            body: studentName + ' purchased ' + courseName + ' successfully.',
            studentName,
            createdAt: FieldValue.serverTimestamp(),
            readAt: null,
            type: 'purchase',
            courseId: record.courseId,
            paymentId: razorpay_payment_id,
            studentUid: user.uid,
          });
        }
      }
    } catch (notificationError) {
      console.error('Purchase notification failed:', notificationError.message);
    }

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


app.get('/invoice/:paymentId', async (req, res) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return res.status(401).json({ error: 'Please log in again.' });
    }

    const paymentId = String(req.params.paymentId || '');
    if (!/^pay_[A-Za-z0-9]+$/.test(paymentId)) {
      return res.status(400).json({ error: 'Invalid payment ID.' });
    }

    const unlocks = readUnlocks();
    const userCourses = (unlocks[user.uid] && unlocks[user.uid].courses) || {};
    let entry = Object.entries(userCourses).find(([, value]) =>
      value && value.paymentId === paymentId
    );

    if (!entry) {
      const { data: dbPurchase, error: dbPurchaseError } = await supabase
        .from('course_purchases')
        .select('course_id, order_id, payment_id, purchase_date, expires_at, validity_months')
        .eq('user_id', user.uid)
        .eq('payment_id', paymentId)
        .maybeSingle();

      if (dbPurchaseError) {
        console.error('Invoice Supabase lookup failed:', dbPurchaseError.message);
        return res.status(500).json({ error: 'Could not look up your verified purchase.' });
      }

      if (dbPurchase) {
        entry = [dbPurchase.course_id, {
          orderId: dbPurchase.order_id,
          paymentId: dbPurchase.payment_id,
          purchaseDate: dbPurchase.purchase_date,
          expiresAt: dbPurchase.expires_at,
          validityMonths: dbPurchase.validity_months
        }];
      }
    }

    if (!entry) {
      return res.status(404).json({ error: 'Verified purchase not found for this account.' });
    }

    const [courseId, purchase] = entry;
    const courseNames = {
      'ssc-reasoning-masterclass': 'SSC Reasoning Masterclass',
      'ssc-general-awareness': 'SSC General Awareness',
      'ssc-english-foundation': 'SSC English Foundation',
      'ssc-mathematics': 'SSC Mathematics',
      'ssc-all-subjects-pack': 'SSC All Subjects Pack',
    };
    const courseName = courseNames[courseId] ||
      (courseId.startsWith('tgpsc-group-') ? 'TGPSC ' + courseId.replace('tgpsc-group-', 'Group ').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) :
       courseId.startsWith('rrb-') ? 'RRB ' + courseId.replace(/^rrb-/, '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) :
       null);
    if (!courseName || !purchase.orderId) {
      return res.status(404).json({ error: 'Invoice details are unavailable.' });
    }

    const orderRecord = readOrders()[purchase.orderId];

    if (orderRecord &&
        (orderRecord.uid !== user.uid ||
         orderRecord.courseId !== courseId ||
         (orderRecord.paymentId && orderRecord.paymentId !== paymentId))) {
      return res.status(403).json({ error: 'Purchase record could not be verified.' });
    }

    let expectedAmount;
    let expectedCurrency;

    if (orderRecord) {
      expectedAmount = orderRecord.amount;
      expectedCurrency = orderRecord.currency || 'INR';
    } else {
      let razorpayOrder;
      try {
        razorpayOrder = await razorpay.orders.fetch(purchase.orderId);
      } catch (orderError) {
        console.error('Invoice order verification failed:', orderError.message);
        return res.status(403).json({ error: 'Original order could not be verified.' });
      }

      const expectedCourseAmount =
        (courseId === 'ssc-all-subjects-pack' || courseId.endsWith('-all-subjects-pack'))
          ? 14900 : 4900;

      if (!razorpayOrder ||
          razorpayOrder.id !== purchase.orderId ||
          razorpayOrder.amount !== expectedCourseAmount ||
          razorpayOrder.currency !== 'INR') {
        return res.status(403).json({ error: 'Original order could not be verified.' });
      }

      expectedAmount = expectedCourseAmount;
      expectedCurrency = 'INR';
    }

    const payment = await razorpay.payments.fetch(paymentId);
    if (!payment || payment.status !== 'captured' ||
        payment.order_id !== purchase.orderId ||
        payment.amount !== expectedAmount ||
        payment.currency !== expectedCurrency) {
      return res.status(403).json({ error: 'A captured payment could not be confirmed.' });
    }

    const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595.28, 841.89]);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const draw = (text, x, y, size = 12, isBold = false) => {
      page.drawText(String(text), {
        x, y, size, font: isBold ? bold : font,
        color: rgb(0.10, 0.20, 0.42),
      });
    };

    const authUser = await firebaseAdminAuth.getUser(user.uid).catch(() => null);
    const studentName = authUser?.displayName || 'Student';
    const date = new Date(purchase.purchaseDate || purchase.unlockedAt || payment.created_at * 1000);
    const dateText = Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : 'N/A';
    const expiry = courseExpiry(purchase);
    const expiryText = expiry ? expiry.toISOString().slice(0, 10) : 'N/A';
    const amount = (payment.amount / 100).toFixed(2);
    const invoiceNumber = 'STUDY-WITH-VEER-' + paymentId;

    draw('STUDY WITH VEER', 50, 770, 24, true);
    draw('PAYMENT INVOICE', 50, 725, 18, true);
    page.drawLine({
      start: { x: 50, y: 705 }, end: { x: 545, y: 705 },
      thickness: 1, color: rgb(0.75, 0.80, 0.88),
    });

    draw('Invoice Number:', 50, 665, 12, true);
    draw(invoiceNumber, 190, 665);
    draw('Payment Status:', 50, 635, 12, true);
    draw('PAID', 190, 635, 12, true);
    draw('Invoice Date:', 50, 605, 12, true);
    draw(dateText, 190, 605);
    draw('Student Name:', 50, 565, 12, true);
    draw(studentName.slice(0, 70), 190, 565);
    draw('Course:', 50, 525, 12, true);
    draw(courseName, 190, 525);
    draw('Purchase Date:', 50, 495, 12, true);
    draw(dateText, 190, 495);
    draw('Validity:', 50, 465, 12, true);
    draw('6 Months', 190, 465);
    draw('Expiry Date:', 50, 435, 12, true);
    draw(expiryText, 190, 435);
    draw('Payment ID:', 50, 405, 12, true);
    draw(paymentId, 190, 405);
    draw('Order ID:', 50, 455, 12, true);
    draw(purchase.orderId, 190, 455);
    page.drawLine({
      start: { x: 50, y: 375 }, end: { x: 545, y: 375 },
      thickness: 1, color: rgb(0.75, 0.80, 0.88),
    });
    draw('Total Paid (INR):', 50, 340, 15, true);
    draw('Rs. ' + amount, 190, 340, 15, true);
    draw('This invoice confirms a captured payment for the course above.', 50, 320, 10);
    draw('STUDY WITH VEER', 50, 90, 11, true);

    const bytes = await pdf.save();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="' + invoiceNumber + '.pdf"');
    res.setHeader('Cache-Control', 'no-store');
    return res.send(Buffer.from(bytes));
  } catch (error) {
    console.error('Invoice generation failed:', error.message);
    return res.status(500).json({ error: 'Could not generate invoice PDF.' });
  }
});

app.get('/my-courses', async (req, res) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return res.status(401).json({ error: 'Please log in again.' });
    }

    try {
      const { data, error } = await supabase
        .from('course_purchases')
        .select('course_id, order_id, payment_id, purchase_date, expires_at, validity_months')
        .eq('user_id', user.uid);

      if (error) throw error;

      const activeCourses = {};
      const purchaseHistory = {};

      for (const row of (data || [])) {
        const purchase = {
          orderId: row.order_id,
          paymentId: row.payment_id,
          purchaseDate: row.purchase_date,
          unlockedAt: row.purchase_date,
          expiresAt: row.expires_at,
          validityMonths: row.validity_months || 6,
        };

        purchaseHistory[row.course_id] = purchase;

        if (isCourseActive(purchase)) {
          activeCourses[row.course_id] = purchase;
        }
      }

      return res.json({
        courses: activeCourses,
        purchaseHistory,
      });
    } catch (dbError) {
      console.error('Supabase course lookup failed; using local fallback:', dbError.message);

      const unlocks = readUnlocks();
      const savedCourses = (unlocks[user.uid] && unlocks[user.uid].courses) || {};
      const activeCourses = Object.fromEntries(
        Object.entries(savedCourses).filter(([, purchase]) => isCourseActive(purchase))
      );

      return res.json({
        courses: activeCourses,
        purchaseHistory: savedCourses,
        source: 'fallback',
      });
    }
  } catch (error) {
    console.error('Course access lookup failed:', error.message);
    return res.status(500).json({ error: 'Could not load course access.' });
  }
});

app.get('/english/articles-preview-url', async (req, res) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Please log in to view the preview.' });
    const result = await supabase.storage.from('English -pdfs').createSignedUrl('Articles/Articles preview.pdf', 60);
    if (result.error) throw result.error;
    return res.json({ url: result.data.signedUrl, expiresIn: 60 });
  } catch (error) {
    console.error('Articles preview access failed:', error.message);
    return res.status(500).json({ error: 'Could not open the Articles preview.' });
  }
});

app.get('/english/articles-full-url', async (req, res) => {
  try {
    console.log('Articles PDF request:', {
      authorizationHeaderPresent: (req.get('authorization') || '').startsWith('Bearer '),
      userVerified: false
    });
    const user = await getAuthenticatedUser(req);
    console.log('Articles PDF auth result:', { userVerified: !!user });
    if (!user) return res.status(401).json({ error: 'Please log in to access the full PDF.' });
    const eligible =
      (await hasActiveCoursePurchase(user.uid, 'ssc-english-foundation')) ||
      (await hasActiveCoursePurchase(user.uid, 'ssc-reasoning-masterclass')) ||
      (await hasActiveCoursePurchase(user.uid, 'ssc-general-awareness')) ||
      (await hasActiveCoursePurchase(user.uid, 'ssc-all-subjects-pack')) ||
      (await hasActiveCoursePurchase(user.uid, 'english-articles-pdf'));
    if (!eligible) return res.status(403).json({ error: 'Full PDF requires an eligible course purchase or Articles PDF purchase.' });
    const result = await supabase.storage.from('English -pdfs').createSignedUrl('Articles/Articles notes.pdf', 60);
    if (result.error) throw result.error;
    return res.json({ url: result.data.signedUrl, expiresIn: 60 });
  } catch (error) {
    console.error('Articles full PDF access failed:', error.message);
    return res.status(500).json({ error: 'Could not open the full Articles PDF.' });
  }
});


app.get('/english/topic-pdf-url', async (req, res) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return res.status(401).json({ error: 'Please log in to view English study material.' });
    }

    const topicFiles = {
      'Nouns': 'Nouns/Nouns notes.pdf',
      'Pronouns': 'Pronoun/pronoun notes.pdf',
      'Verbs': 'Verb tenses/Verb tense notes.pdf',
      'Tenses': 'Tenses/Tense notes.pdf',
      'Subject-Verb Agreement': 'Concord/Concord notes.pdf',
      'Adjectives & Adverbs': 'Adjectives/Adjective notes.pdf',
      'Conjunctions': 'Conjunction/Conjunction notes.pdf',
      'Active & Passive Voice': 'Active and Passive/Active and passive voice notes2.pdf',
      'Cloze Test': 'Cloze tests/Cloze test notes.pdf',
      'Question Tags': 'Question Tags/Questions tags.pdf'
    };

    const filePath = topicFiles[req.query.topic];
    if (!filePath) {
      return res.status(404).json({ error: 'No matching PDF is available for this topic yet.' });
    }

    const tgpscGroup = typeof req.query.group === 'string' ? req.query.group : '';
    const isTgpscGroup = /^tgpsc-group-[1-4]$/.test(tgpscGroup);
    const eligible = isTgpscGroup
      ? await hasActiveCoursePurchase(user.uid, tgpscGroup + '-english')
      : (
          (await hasActiveCoursePurchase(user.uid, 'ssc-english-foundation')) ||
          (await hasActiveCoursePurchase(user.uid, 'ssc-reasoning-masterclass')) ||
          (await hasActiveCoursePurchase(user.uid, 'ssc-general-awareness')) ||
          (await hasActiveCoursePurchase(user.uid, 'ssc-all-subjects-pack')) ||
          (await hasActiveCoursePurchase(user.uid, 'english-articles-pdf'))
        );

    if (!eligible) {
      return res.status(403).json({
        error: isTgpscGroup ? 'Purchase this TGPSC Group English course to access these PDFs.' : 'English study PDFs require an eligible course purchase.'
      });
    }

    const result = await supabase.storage
      .from('English -pdfs')
      .createSignedUrl(filePath, 60);

    if (result.error) throw result.error;

    return res.json({ url: result.data.signedUrl, expiresIn: 60 });
  } catch (error) {
    console.error('English topic PDF access failed:', error.message);
    return res.status(500).json({ error: 'Could not open this English PDF.' });
  }
});



app.get('/mathematics/topic-pdf-url', async (req, res) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return res.status(401).json({ error: 'Please log in to view Mathematics study material.' });
    }

    const topicFiles = {
      'Profit & Loss': 'Arithmetic/Profit_and_Loss.pdf',
      'Percentage': 'Arithmetic/PercentageS.pdf',
      'Time & Work': 'Arithmetic/Time_and_Work.pdf',
      'Discount': 'Arithmetic/Discount.pdf',
      'Partnership': 'Arithmetic/Partnership.pdf',
      'Simple Interest': 'Arithmetic/Simple_interest.pdf',
      'Average': 'Arithmetic/AVERAGES.pdf',
      'Boats & Streams': 'Arithmetic/BOATS AND STREMS .pdf',
      'Ages': 'Arithmetic/Ages_RAM_NAYAK.pdf',
      'Chain Rule': 'Arithmetic/CHAIN RULE .pdf',
      'Problems on Trains': 'Arithmetic/Problems_on_Trains.pdf',
      'Ratio & Proportion': 'Arithmetic/Ratio_and_Proportion.pdf',
      'Pipes & Cisterns': 'Arithmetic/Pipes_and_Cisterns (1).pdf'
    };

    const filePath = topicFiles[req.query.topic];
    if (!filePath) {
      return res.status(404).json({ error: 'No Mathematics PDF is available for this topic yet.' });
    }

    const exam = typeof req.query.exam === 'string' ? req.query.exam : '';
    console.log('Mathematics exam diagnostic:', JSON.stringify({ exam, topic: req.query.topic }));
    let eligible;
    if (!exam) {
      eligible =
        (await hasActiveCoursePurchase(user.uid, 'ssc-mathematics')) ||
        (await hasActiveCoursePurchase(user.uid, 'ssc-all-subjects-pack'));
    } else if (['rrb-ntpc','rrb-group-d','rrb-alp','rrb-technician'].includes(exam)) {
      eligible =
        (await hasActiveCoursePurchase(user.uid, exam + '-mathematics')) ||
        (await hasActiveCoursePurchase(user.uid, exam + '-all-subjects-pack'));
    } else if (/^tgpsc-group-[1-4]$/.test(exam)) {
      eligible = await hasActiveCoursePurchase(user.uid, exam + '-mathematics');
    } else {
      return res.status(400).json({ error: 'Invalid exam.' });
    }
    if (!eligible) {
      return res.status(403).json({
        error: /^tgpsc-group-[1-4]$/.test(exam)
          ? 'Purchase this TGPSC Group Mathematics course to access these PDFs.'
          : exam
            ? 'Purchase this RRB exam Mathematics course or its All-in-One Pack to access these PDFs.'
            : 'Purchase the SSC Mathematics course to access these PDFs.'
      });
    }

    const result = await supabase.storage
      .from('Mathematics-pdfs')
      .createSignedUrl(filePath, 60);

    if (result.error) throw result.error;

    return res.json({ url: result.data.signedUrl, expiresIn: 60 });
  } catch (error) {
    console.error('Mathematics PDF access failed:', error.message);
    return res.status(500).json({ error: 'Could not open this Mathematics PDF.' });
  }
});


app.get('/reasoning/topic-pdf-url', async (req, res) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return res.status(401).json({ error: 'Please log in to view Reasoning study material.' });
    }

    const topicFiles = {
      'Analogy': 'Analogy/Analogy.pdf',
      'Blood Relations': 'Blood Relations/Blood relation.pdf',
      'Calendar': 'Calendar/Calendar .pdf',
      'Coding and Decoding': 'Coding and Decoding/Coding - decoding.pdf',
      'Dice': 'Dice/Dice.pdf',
      'Directions': 'Directions/Directions.pdf',
      'Seating Arrangement': 'Seating Arrangement/Seating arrangement.pdf',
      'Venn Diagram': 'Venn Diagram/Venn diagram.pdf'
    };

    const filePath = topicFiles[req.query.topic];
    if (!filePath) {
      return res.status(404).json({ error: 'No Reasoning PDF is available for this topic yet.' });
    }

    const exam = typeof req.query.exam === 'string' ? req.query.exam : '';
    let eligible;
    if (!exam) {
      eligible =
        (await hasActiveCoursePurchase(user.uid, 'ssc-reasoning-masterclass')) ||
        (await hasActiveCoursePurchase(user.uid, 'ssc-all-subjects-pack'));
    } else if (['rrb-ntpc','rrb-group-d','rrb-alp','rrb-technician'].includes(exam)) {
      eligible =
        (await hasActiveCoursePurchase(user.uid, exam + '-reasoning')) ||
        (await hasActiveCoursePurchase(user.uid, exam + '-all-subjects-pack'));
    } else if (/^tgpsc-group-[1-4]$/.test(exam)) {
      eligible = await hasActiveCoursePurchase(user.uid, exam + '-reasoning');
    } else {
      return res.status(400).json({ error: 'Invalid exam.' });
    }
    if (!eligible) {
      return res.status(403).json({
        error: /^tgpsc-group-[1-4]$/.test(exam)
          ? 'Purchase this TGPSC Group Reasoning course to access these PDFs.'
          : exam
            ? 'Purchase this RRB exam Reasoning course or its All-in-One Pack to access these PDFs.'
            : 'Purchase the SSC Reasoning course to access these PDFs.'
      });
    }

    const result = await supabase.storage
      .from('Reasoning-pdfs')
      .createSignedUrl(filePath, 60);

    if (result.error) throw result.error;

    return res.json({ url: result.data.signedUrl, expiresIn: 60 });
  } catch (error) {
    console.error('Reasoning PDF access failed:', error.message);
    return res.status(500).json({ error: 'Could not open this Reasoning PDF.' });
  }
});


async function hasGeneralAwarenessAccess(userId, exam) {
  if (exam === undefined || exam === '') {
    return hasActiveCoursePurchase(userId, 'ssc-general-awareness') ||
      hasActiveCoursePurchase(userId, 'ssc-all-subjects-pack');
  }

  const allowedExams = [
    'rrb-ntpc',
    'rrb-group-d',
    'rrb-alp',
    'rrb-technician'
  ];

  if (!allowedExams.includes(exam) && !/^tgpsc-group-[1-4]$/.test(exam)) return false;

  return (await hasActiveCoursePurchase(userId, exam + '-general-awareness')) ||
    (await hasActiveCoursePurchase(userId, exam + '-all-subjects-pack'));
}

app.get('/tgpsc/telangana-pdf-url', async (req, res) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Please log in to view this PDF.' });

    const exam = typeof req.query.exam === 'string' ? req.query.exam : '';
    const subject = typeof req.query.subject === 'string' ? req.query.subject : '';
    const filename = typeof req.query.file === 'string' ? req.query.file : '';

    if (!/^tgpsc-group-[1-4]$/.test(exam)) {
      return res.status(400).json({ error: 'Invalid TGPSC exam.' });
    }

    const allowedFiles = {
      'Telangana Movement': ['TS MOVEMENT .pdf'],
      'Telangana History': [
        'LEC - 1 & 2.pdf',
        'lec - 3.pdf',
        'lec 4.pdf',
        'lec 5.pdf',
        'lec 6.pdf',
        'Lec 7.pdf'
      ]
    };

    if (!allowedFiles[subject] || !allowedFiles[subject].includes(filename)) {
      return res.status(400).json({ error: 'Invalid Telangana study PDF.' });
    }

    const courseId = exam + '-' + (subject === 'Telangana History' ? 'telangana-history' : 'telangana-movement');
    if (!(await hasActiveCoursePurchase(user.uid, courseId))) {
      return res.status(403).json({ error: 'Purchase this TGPSC subject to access its PDFs.' });
    }

    const result = await supabase.storage.from('Mathematics-pdfs')
      .createSignedUrl('TGPSC/' + filename, 60);
    if (result.error) throw result.error;

    return res.json({ url: result.data.signedUrl, expiresIn: 60 });
  } catch (error) {
    console.error('TGPSC Telangana PDF access failed:', error.message);
    return res.status(500).json({ error: 'Could not open this Telangana PDF.' });
  }
});

app.get('/general-awareness/folders', async (req, res) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return res.status(401).json({ error: 'Please log in to access General Awareness folders.' });
    }

    const requestedExam = typeof req.query.exam === 'string' ? req.query.exam : undefined;
    if (!(await hasGeneralAwarenessAccess(user.uid, requestedExam))) {
      return res.status(403).json({ error: 'Purchase the General Awareness course to access these folders.' });
    }

    const result = await supabase.storage
      .from('gs')
      .list('', { limit: 100, sortBy: { column: 'name', order: 'asc' } });

    if (result.error) throw result.error;

    const folders = (result.data || [])
      .filter(item => item.name && item.id == null && !item.metadata)
      .map(item => ({ name: item.name }));

    return res.json({ folders });
  } catch (error) {
    console.error('General Awareness folder list failed:', error.message);
    return res.status(500).json({ error: 'Could not load General Awareness folders.' });
  }
});

app.get('/general-awareness/topic-files', async (req, res) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return res.status(401).json({ error: 'Please log in to access General Awareness PDFs.' });
    }

    const requestedExam = typeof req.query.exam === 'string' ? req.query.exam : undefined;
    if (!(await hasGeneralAwarenessAccess(user.uid, requestedExam))) {
      return res.status(403).json({ error: 'Purchase the General Awareness course to access these PDFs.' });
    }

    const folder = req.query.topic;
    if (typeof folder !== 'string' || !/^[a-zA-Z0-9 _().-]+$/.test(folder)) {
      return res.status(400).json({ error: 'Invalid topic folder.' });
    }

    const root = await supabase.storage.from('gs')
      .list('', { limit: 100 });
    if (root.error) throw root.error;

    const exists = (root.data || []).some(item =>
      item.name === folder && item.id === null && !item.metadata
    );
    if (!exists) {
      return res.status(400).json({ error: 'Invalid topic folder.' });
    }

    const result = await supabase.storage.from('gs')
      .list(folder, { limit: 100, sortBy: { column: 'name', order: 'asc' } });
    if (result.error) throw result.error;

    const files = (result.data || [])
      .filter(item => item.name && item.name.toLowerCase().endsWith('.pdf'))
      .map(item => ({ name: item.name }));

    console.log('GA PDF diagnostic:', {
      bucket: 'gs',
      folder,
      pdfCount: files.length,
      pdfNames: files.map(item => item.name)
    });

    return res.json({ topic: folder, files });
  } catch (error) {
    console.error('General Awareness PDF list failed:', error.message);
    return res.status(500).json({ error: 'Could not load General Awareness PDFs.' });
  }
});

app.get('/general-awareness/topic-pdf-url', async (req, res) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return res.status(401).json({ error: 'Please log in to access General Awareness PDFs.' });
    }

    const requestedExam = typeof req.query.exam === 'string' ? req.query.exam : undefined;
    if (!(await hasGeneralAwarenessAccess(user.uid, requestedExam))) {
      return res.status(403).json({
        error: 'Purchase the General Awareness course to access these PDFs.'
      });
    }

    const folder = typeof req.query.topic === 'string' ? req.query.topic : '';
    const filename = typeof req.query.file === 'string' ? req.query.file : '';

    if (!folder || !/^[a-zA-Z0-9 _().-]+$/.test(folder) ||
        !filename || filename.includes('/') ||
        filename.includes('\\') || filename === '.' || filename === '..' ||
        !/^[a-zA-Z0-9 _().-]+\.pdf$/i.test(filename)) {
      return res.status(400).json({ error: 'Invalid topic or PDF filename.' });
    }

    const root = await supabase.storage.from('gs')
      .list('', { limit: 100 });
    if (root.error) throw root.error;

    const folderExists = (root.data || []).some(item =>
      item.name === folder && item.id === null && !item.metadata
    );
    if (!folderExists) {
      return res.status(400).json({ error: 'Invalid topic folder.' });
    }

    const folderFiles = await supabase.storage.from('gs')
      .list(folder, { limit: 100 });
    if (folderFiles.error) throw folderFiles.error;

    const fileExists = (folderFiles.data || []).some(item =>
      item.name === filename && item.name.toLowerCase().endsWith('.pdf')
    );
    if (!fileExists) {
      return res.status(404).json({ error: 'PDF not found in this topic folder.' });
    }

    const result = await supabase.storage
      .from('gs')
      .createSignedUrl(folder + '/' + filename, 60);

    if (result.error) {
      if (result.error.message && /not found|does not exist/i.test(result.error.message)) {
        return res.status(404).json({ error: 'PDF not found in this topic folder.' });
      }
      throw result.error;
    }

    return res.json({ url: result.data.signedUrl, expiresIn: 60 });
  } catch (error) {
    console.error('General Awareness PDF access failed:', error.message);
    return res.status(500).json({ error: 'Could not open this General Awareness PDF.' });
  }
});

const PORT = process.env.PORT || 3000;



// STUDY_WITH_VEER_CHAT_ROUTES
function getChatAdminUids() {
  return (process.env.ADMIN_UIDS || '').split(',').map(x => x.trim()).filter(Boolean);
}

app.get('/chat/admin-status', async (req, res) => {
  const user = await getAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: 'Please log in first.' });
  return res.json({ isAdmin: getChatAdminUids().includes(user.uid) });
});

app.get('/chat/conversations', async (req, res) => {
  const user = await getAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: 'Please log in first.' });

  const isAdmin = getChatAdminUids().includes(user.uid);
  try {
    const chats = firebaseAdminDb.collection('supportChats');
    let docs;
    if (isAdmin) {
      const snap = await chats.orderBy('updatedAt', 'desc').limit(100).get();
      docs = snap.docs;
    } else {
      const snap = await chats.where('studentUid', '==', user.uid).limit(1).get();
      docs = snap.docs;
    }

    return res.json({
      conversations: docs.map(d => {
        const v = d.data();
        return {
          id: d.id,
          studentUid: v.studentUid,
          studentName: v.studentName || 'Student',
          studentEmail: v.studentEmail || '',
          lastMessage: v.lastMessage || '',
          updatedAt: v.updatedAt?.toDate?.()?.toISOString?.() || null
        };
      })
    });
  } catch (error) {
    console.error('Chat conversation list failed:', error.message);
    return res.status(500).json({ error: 'Could not load conversations.' });
  }
});

app.get('/chat/messages/:chatId', async (req, res) => {
  const user = await getAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: 'Please log in first.' });

  const chatId = String(req.params.chatId || '');
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(chatId)) {
    return res.status(400).json({ error: 'Invalid conversation ID.' });
  }

  try {
    const chatRef = firebaseAdminDb.collection('supportChats').doc(chatId);
    const chatSnap = await chatRef.get();
    if (!chatSnap.exists) return res.status(404).json({ error: 'Conversation not found.' });

    const chat = chatSnap.data();
    const isAdmin = getChatAdminUids().includes(user.uid);
    if (!isAdmin && chat.studentUid !== user.uid) {
      return res.status(403).json({ error: 'You cannot access this conversation.' });
    }

    const snap = await chatRef.collection('messages').orderBy('createdAt', 'asc').limit(200).get();
    return res.json({
      messages: snap.docs.map(d => {
        const v = d.data();
        return {
          id: d.id,
          senderUid: v.senderUid,
          senderName: v.senderName || 'User',
          text: v.text || '',
          createdAt: v.createdAt?.toDate?.()?.toISOString?.() || null
        };
      })
    });
  } catch (error) {
    console.error('Chat message load failed:', error.message);
    return res.status(500).json({ error: 'Could not load messages.' });
  }
});

app.post('/chat/messages/:chatId', async (req, res) => {
  const user = await getAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: 'Please log in first.' });

  const chatId = String(req.params.chatId || '');
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(chatId)) {
    return res.status(400).json({ error: 'Invalid conversation ID.' });
  }
  if (!text || text.length > 2000) {
    return res.status(400).json({ error: 'Message must be 1–2000 characters.' });
  }

  try {
    const isAdmin = getChatAdminUids().includes(user.uid);
    const chats = firebaseAdminDb.collection('supportChats');
    const chatRef = chats.doc(chatId);
    let chatSnap = await chatRef.get();

    if (!chatSnap.exists) {
      if (isAdmin || chatId !== user.uid) {
        return res.status(404).json({ error: 'Conversation not found.' });
      }
      await chatRef.create({
        studentUid: user.uid,
        studentName: user.name || user.email || 'Student',
        studentEmail: user.email || '',
        lastMessage: '',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });
      chatSnap = await chatRef.get();
    }

    const chat = chatSnap.data();
    if (!isAdmin && chat.studentUid !== user.uid) {
      return res.status(403).json({ error: 'You cannot send to this conversation.' });
    }

    const message = {
      senderUid: user.uid,
      senderName: isAdmin ? 'Admin' : (user.name || user.email || 'Student'),
      text,
      createdAt: FieldValue.serverTimestamp()
    };

    await chatRef.collection('messages').add(message);
    await chatRef.set({
      lastMessage: text.slice(0, 160),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });

    // VEER_CHAT_PUSH_NOTIFICATION
    try {
      const recipientUids = isAdmin
        ? [chat.studentUid].filter(Boolean)
        : getChatAdminUids().filter(uid => uid !== user.uid);

      const pushMessages = [];

      for (const recipientUid of recipientUids) {
        const tokenSnap = await firebaseAdminDb
          .collection('users').doc(recipientUid)
          .collection('pushTokens').get();

        for (const tokenDoc of tokenSnap.docs) {
          const pushToken = tokenDoc.data().token;
          if (typeof pushToken === 'string' &&
              /^Expo(nent)?PushToken\[[^\]]+\]$/.test(pushToken)) {
            pushMessages.push({
              to: pushToken,
              sound: 'default',
              title: isAdmin ? 'STUDY WITH VEER — Admin Reply' : 'STUDY WITH VEER — New Chat Message',
              body: text.slice(0, 160),
              data: { type: 'chat-message', chatId }
            });
          }
        }
      }

      for (let i = 0; i < pushMessages.length; i += 100) {
        await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(pushMessages.slice(i, i + 100))
        });
      }
    } catch (pushError) {
      console.error('Chat push notification failed:', pushError.message);
    }

    return res.json({ sent: true });
  } catch (error) {
    console.error('Chat message send failed:', error.message);
    return res.status(500).json({ error: 'Could not send message.' });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Payment backend running on port ${PORT}`);
});
