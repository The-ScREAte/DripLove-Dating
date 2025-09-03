-- Add 'cancelled' as a valid subscription status if not exists
DO $$ BEGIN
    -- Check if 'cancelled' status exists in the constraint
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.check_constraints 
        WHERE constraint_name LIKE '%user_subscriptions_status_check%' 
        AND check_clause LIKE '%cancelled%'
    ) THEN
        -- Drop the existing constraint if it exists
        IF EXISTS (
            SELECT 1 FROM information_schema.check_constraints 
            WHERE constraint_name LIKE '%user_subscriptions_status_check%'
        ) THEN
            ALTER TABLE user_subscriptions DROP CONSTRAINT IF EXISTS user_subscriptions_status_check;
        END IF;
        
        -- Add new constraint with 'cancelled' status
        ALTER TABLE user_subscriptions 
        ADD CONSTRAINT user_subscriptions_status_check 
        CHECK (status IN ('active', 'inactive', 'cancelled', 'expired', 'paused'));
    END IF;
END $$;