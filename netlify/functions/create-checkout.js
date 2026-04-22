const Razorpay = require('razorpay');

// Plan IDs created once in Razorpay dashboard (or via API)
const PLAN_IDS = {
  standard_monthly: process.env.RAZORPAY_PLAN_STANDARD_MONTHLY,
  standard_yearly:  process.env.RAZORPAY_PLAN_STANDARD_YEARLY,
  pro_monthly:      process.env.RAZORPAY_PLAN_PRO_MONTHLY,
  pro_yearly:       process.env.RAZORPAY_PLAN_PRO_YEARLY,
};


exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let plan, billing, pharmacyName;
  try {
    ({ plan, billing, pharmacyName } = JSON.parse(event.body));
  } catch {
    return { statusCode: 400, body: 'Bad Request' };
  }

  if (!pharmacyName?.trim()) {
    return { statusCode: 400, body: 'Pharmacy name is required' };
  }

  const planId = PLAN_IDS[`${plan}_${billing}`];
  if (!planId) {
    return { statusCode: 400, body: `Unknown plan: ${plan}/${billing}` };
  }

  try {
    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    const totalCount = billing === 'yearly' ? 1 : 12; // cycles before expiry

    const subscription = await razorpay.subscriptions.create({
      plan_id: planId,
      customer_notify: 1,
      total_count: totalCount,
      notes: {
        pharmacy_name: pharmacyName.trim(),
        plan,
        billing,
      },
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: subscription.short_url }),
    };
  } catch (err) {
    console.error('Razorpay error:', err.message, err.error);
    return { statusCode: 500, body: 'Failed to create checkout' };
  }
};
