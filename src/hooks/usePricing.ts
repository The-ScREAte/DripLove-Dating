import { useState, useEffect } from 'react';
import { getPremiumPaymentConfig } from '@/utils/paymentConfig';

interface PricingData {
  oneTimePrice: string;
  monthlyPrice: string | null;
  currency: string;
  loading: boolean;
}

export const usePricing = (): PricingData => {
  const [pricing, setPricing] = useState<PricingData>({
    oneTimePrice: '50',
    monthlyPrice: '35',
    currency: 'GHS',
    loading: true
  });

  useEffect(() => {
    const fetchPricing = async () => {
      try {
        const config = await getPremiumPaymentConfig();
        setPricing({
          oneTimePrice: config.price,
          monthlyPrice: config.monthlyPrice,
          currency: config.currency,
          loading: false
        });
      } catch (error) {
        console.error('Error fetching pricing:', error);
        setPricing(prev => ({ ...prev, loading: false }));
      }
    };

    fetchPricing();
  }, []);

  return pricing;
};