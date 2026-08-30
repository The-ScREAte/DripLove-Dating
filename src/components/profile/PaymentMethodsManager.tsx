import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { CreditCard, Trash2, Plus } from 'lucide-react';
import StripeCardStep from './StripeCardStep';

interface CardInfo {
  id: string;
  brand: string;
  last4: string;
  expMonth: number | null;
  expYear: number | null;
  isDefault: boolean;
}

const invokeAuthed = async <T,>(fn: string, body: Record<string, unknown>): Promise<T> => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not signed in');
  const { data, error } = await supabase.functions.invoke(fn, {
    body,
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (error) throw error;
  if (data && data.success === false) throw new Error(data.error || `${fn} failed`);
  return data as T;
};

const brandLabel = (brand: string) => {
  const known: Record<string, string> = {
    visa: 'Visa', mastercard: 'Mastercard', amex: 'American Express',
    discover: 'Discover', diners: 'Diners Club', jcb: 'JCB', unionpay: 'UnionPay',
  };
  return known[brand] || (brand.charAt(0).toUpperCase() + brand.slice(1));
};

const PaymentMethodsManager: React.FC = () => {
  const { toast } = useToast();
  const [cards, setCards] = useState<CardInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [showAddCard, setShowAddCard] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loadingAdd, setLoadingAdd] = useState(false);
  const [savingCard, setSavingCard] = useState(false);

  const fetchCards = useCallback(async () => {
    setLoading(true);
    try {
      const result = await invokeAuthed<{ cards: CardInfo[] }>('stripe-list-payment-methods', {});
      setCards(result.cards || []);
    } catch (error) {
      console.error('Error fetching payment methods:', error);
      toast({ title: 'Error', description: 'Failed to load your payment methods', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchCards();
  }, [fetchCards]);

  const handleOpenAddCard = async () => {
    setLoadingAdd(true);
    try {
      const result = await invokeAuthed<{ clientSecret: string }>('stripe-setup-intent', {});
      setClientSecret(result.clientSecret);
      setShowAddCard(true);
    } catch (error) {
      console.error('Error starting card setup:', error);
      toast({ title: 'Error', description: 'Failed to start adding a new card. Please try again.', variant: 'destructive' });
    } finally {
      setLoadingAdd(false);
    }
  };

  const handleCardSaved = async (paymentMethodId: string) => {
    setSavingCard(true);
    try {
      await invokeAuthed('stripe-confirm-card-setup', { paymentMethodId });
      toast({ title: 'Card added', description: 'Your new card has been saved.' });
      setShowAddCard(false);
      setClientSecret(null);
      fetchCards();
    } catch (error) {
      console.error('Error saving new card:', error);
      toast({ title: 'Error', description: 'Failed to save your card', variant: 'destructive' });
    } finally {
      setSavingCard(false);
    }
  };

  const handleRemove = async (cardId: string) => {
    if (cards.length <= 1) {
      toast({ title: 'Error', description: 'You must keep at least one card on file.', variant: 'destructive' });
      return;
    }
    if (!confirm('Remove this card?')) return;

    setRemovingId(cardId);
    try {
      await invokeAuthed('stripe-remove-payment-method', { paymentMethodId: cardId });
      toast({ title: 'Card removed' });
      fetchCards();
    } catch (error) {
      console.error('Error removing card:', error);
      toast({ title: 'Error', description: error instanceof Error ? error.message : 'Failed to remove card', variant: 'destructive' });
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="space-y-3">
      {loading ? (
        <p className="text-center text-gray-400 text-sm py-4">Loading your cards...</p>
      ) : cards.length === 0 ? (
        <p className="text-center text-gray-400 text-sm py-4">No cards on file yet.</p>
      ) : (
        <div className="space-y-2">
          {cards.map((card) => (
            <div
              key={card.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-pink-500/20 bg-black px-3 py-2.5"
            >
              <div className="flex items-center gap-3 min-w-0">
                <CreditCard className="w-5 h-5 text-pink-400 shrink-0" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-white truncate">
                      {brandLabel(card.brand)} •••• {card.last4}
                    </p>
                    {card.isDefault && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-pink-500/15 text-pink-400 font-medium shrink-0">
                        Default
                      </span>
                    )}
                  </div>
                  {card.expMonth && card.expYear && (
                    <p className="text-xs text-gray-500">Expires {String(card.expMonth).padStart(2, '0')}/{card.expYear}</p>
                  )}
                </div>
              </div>
              <Button
                variant="destructive"
                size="icon"
                onClick={() => handleRemove(card.id)}
                disabled={removingId === card.id || cards.length <= 1}
                title={cards.length <= 1 ? 'You must keep at least one card on file' : 'Remove card'}
                className="h-8 w-8 shrink-0"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Button
        type="button"
        onClick={handleOpenAddCard}
        disabled={loadingAdd}
        variant="outline"
        className="w-full bg-black border-pink-500/30 text-white hover:bg-pink-500/10 hover:text-white"
      >
        <Plus className="w-4 h-4 mr-1.5" />
        {loadingAdd ? 'Loading...' : 'Add Another Card'}
      </Button>

      <Dialog open={showAddCard} onOpenChange={(open) => { if (!open) { setShowAddCard(false); setClientSecret(null); } }}>
        <DialogContent className="max-w-sm bg-black border border-pink-500/30">
          <DialogHeader>
            <DialogTitle className="text-white">Add a Card</DialogTitle>
          </DialogHeader>
          {clientSecret && (
            <StripeCardStep
              clientSecret={clientSecret}
              submitting={savingCard}
              canSubmit
              onCardSaved={handleCardSaved}
              onBack={() => { setShowAddCard(false); setClientSecret(null); }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PaymentMethodsManager;
