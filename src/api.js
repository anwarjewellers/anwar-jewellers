// Tiny fetch wrapper for our /api.
export class ApiError extends Error {
  constructor(status, message, fields) {
    super(message);
    this.status = status;
    this.fields = fields || {};
  }
}

export async function api(path, { method = 'GET', body, form } = {}) {
  const headers = { 'X-Requested-With': 'fetch', Accept: 'application/json' };
  let payload;
  if (form) payload = form; // FormData (file uploads)
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }

  let res;
  try {
    res = await fetch(`/api${path}`, { method, headers, body: payload, credentials: 'same-origin' });
  } catch {
    throw new ApiError(0, 'No internet connection. Please check your network and try again.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error || 'Something went wrong. Please try again.', data.fields);
  return data;
}

let razorpayScript;
function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve();
  razorpayScript ||= new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = 'https://checkout.razorpay.com/v1/checkout.js';
    el.onload = resolve;
    el.onerror = () => { razorpayScript = null; reject(new ApiError(0, 'Could not load the payment window. Please check your internet and try again.')); };
    document.body.appendChild(el);
  });
  return razorpayScript;
}

/**
 * Opens the Razorpay payment popup for our order and resolves with
 * 'success' | 'failed' | 'pending' | 'cancelled' once the server has checked the payment.
 */
export async function payWithRazorpay(orderId, checkout) {
  await loadRazorpay();
  return new Promise((resolve) => {
    let done = false;
    const finish = async (path, body) => {
      if (done) return;
      done = true;
      try { resolve((await api(`/orders/${orderId}/payment/${path}`, { method: 'POST', body })).status); } catch { resolve('pending'); }
    };
    const rzp = new window.Razorpay({
      ...checkout,
      handler: (response) => finish('verify', response),
      modal: {
        confirm_close: true,
        ondismiss: async () => {
          if (done) return;
          done = true;
          // The customer closed the window; check in case they paid just before closing.
          try {
            const { status } = await api(`/orders/${orderId}/payment/sync`, { method: 'POST' });
            resolve(status === 'success' ? 'success' : 'cancelled');
          } catch { resolve('cancelled'); }
        },
      },
    });
    // A failed attempt keeps the popup open so the customer can retry; nothing to do here.
    rzp.on('payment.failed', () => {});
    rzp.open();
  });
}
