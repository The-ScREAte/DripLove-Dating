export function getPremiumPaymentConfig() {
  if (typeof window !== 'undefined') {
    const price = localStorage.getItem('premium_price') || '50';
    const paymentMethods = JSON.parse(localStorage.getItem('payment_methods') || '[]');
    // Only return payment methods that have required details filled
    const validMethods = paymentMethods.filter((m: any) => m.details && (m.type !== 'momo' || m.name));
    return { price, paymentMethods: validMethods };
  } else {
    return { price: '50', paymentMethods: [] };
  }
}
