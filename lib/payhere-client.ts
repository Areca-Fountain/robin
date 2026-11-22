export interface PayHerePaymentObject {
  sandbox: boolean;
  merchant_id: string;
  return_url: string;
  cancel_url: string;
  notify_url: string;
  order_id: string;
  items: string;
  amount: string;
  currency: string;
  hash: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  country: string;
  custom_1?: string;
  custom_2?: string;
}

interface PayHereSDK {
  onCompleted: (orderId: string) => void;
  onDismissed: () => void;
  onError: (error: string) => void;
  startPayment: (payment: PayHerePaymentObject) => void;
}

declare global {
  interface Window {
    payhere?: PayHereSDK;
  }
}

function loadPayHereScript(): Promise<PayHereSDK> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("PayHere can only run in the browser."));
      return;
    }
    if (window.payhere) {
      resolve(window.payhere);
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>(
      'script[src="https://www.payhere.lk/lib/payhere.js"]'
    );
    if (existing) {
      existing.addEventListener("load", () => {
        if (window.payhere) resolve(window.payhere);
        else reject(new Error("PayHere SDK failed to initialize."));
      });
      existing.addEventListener("error", () =>
        reject(new Error("Could not load PayHere SDK script."))
      );
      return;
    }

    const script = document.createElement("script");
    script.src = "https://www.payhere.lk/lib/payhere.js";
    script.async = true;
    script.onload = () => {
      if (window.payhere) resolve(window.payhere);
      else reject(new Error("PayHere SDK failed to initialize."));
    };
    script.onerror = () => reject(new Error("Could not load PayHere SDK script."));
    document.body.appendChild(script);
  });
}

export async function openPayHereCheckout(
  payment: PayHerePaymentObject,
  callbacks: {
    onCompleted: (orderId: string) => void;
    onDismissed: () => void;
    onError: (errMsg: string) => void;
  }
) {
  const sdk = await loadPayHereScript();
  sdk.onCompleted = callbacks.onCompleted;
  sdk.onDismissed = callbacks.onDismissed;
  sdk.onError = callbacks.onError;
  sdk.startPayment(payment);
}