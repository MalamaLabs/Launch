import React, { useCallback, useState } from 'react';
import { useMagic } from '@/hooks/MagicProvider';
import FormButton from '@/components/ui/FormButton';
import showToast from '@/utils/showToast';

const RevealPrivateKey = () => {
  const { magic } = useMagic();
  const [disabled, setDisabled] = useState(false);

  const handleReveal = useCallback(async () => {
    if (!magic) return;
    setDisabled(true);
    try {
      // magic-sdk v29.x uses revealPrivateKey()
      // If you upgrade to v31+, rename this to magic.user.revealEVMPrivateKey()
      await magic.user.revealPrivateKey();
    } catch (e: any) {
      console.error('Reveal private key error:', e);
      showToast({
        message: e?.message ?? 'Failed to reveal private key',
        type: 'error',
      });
    } finally {
      setDisabled(false);
    }
  }, [magic]);

  return (
    <FormButton onClick={handleReveal} disabled={disabled}>
      {disabled ? 'Opening...' : 'Export Private Key'}
    </FormButton>
  );
};

export default RevealPrivateKey;
