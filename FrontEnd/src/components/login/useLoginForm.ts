import { useState, type FormEvent } from 'react';
import { useRouter } from '@/lib/client/nav';
import { signIn } from '@/lib/client/app-login';
import { newCaptcha } from './captcha-code';

/** The sign-in form's state and submit, shared by the Tile and Normal login views. */
export function useLoginForm(initialCaptcha: string) {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [captcha, setCaptcha] = useState(initialCaptcha);
  const [captchaInput, setCaptchaInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const refreshCaptcha = () => { setCaptcha(newCaptcha()); setCaptchaInput(''); };

  function submit(event: FormEvent) {
    event.preventDefault();
    if (captchaInput.trim().toUpperCase() !== captcha) { setError('That captcha code does not match. Please try the new code.'); refreshCaptcha(); return; }
    setPassword('');
    // The workspace login is checked in this browser (it gates the screens; SAP checks its own users).
    if (!signIn(username, password)) { setError('Incorrect user name or password.'); refreshCaptcha(); return; }
    setBusy(true);
    setError('');
    router.replace('/');
    router.refresh();
  }

  return { username, setUsername, password, setPassword, show, setShow, captcha, captchaInput, setCaptchaInput, busy, error, refreshCaptcha, submit };
}
