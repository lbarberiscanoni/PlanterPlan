import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { planter } from '@/shared/api/planterClient';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { clearPasswordRecoverySession, hasPasswordRecoverySession } from '@/shared/lib/password-recovery';

export default function ResetPassword() {
 const { t } = useTranslation();
 const navigate = useNavigate();
 const [newPassword, setNewPassword] = useState('');
 const [confirmPassword, setConfirmPassword] = useState('');
 const [error, setError] = useState('');
 const [loading, setLoading] = useState(false);

 const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
 event.preventDefault();
 setError('');

 if (!hasPasswordRecoverySession()) {
 setError(t('auth.reset_password_invalid_session'));
 toast.error(t('auth.reset_password_failed_title'), {
 description: t('auth.reset_password_invalid_session'),
 });
 return;
 }

 if (newPassword.length < 8) {
 setError(t('auth.reset_password_min_length'));
 return;
 }

 if (newPassword !== confirmPassword) {
 setError(t('auth.reset_password_mismatch'));
 return;
 }

 setLoading(true);
 try {
 await planter.auth.completePasswordReset(newPassword);
 clearPasswordRecoverySession();
 toast.success(t('auth.reset_password_success_title'), {
 description: t('auth.reset_password_success_description'),
 });
 navigate('/login');
 } catch (err) {
 console.error('Error resetting password:', err);
 const description = err instanceof Error && err.message
 ? err.message
 : t('auth.reset_password_invalid_session');
 setError(description);
 toast.error(t('auth.reset_password_failed_title'), {
 description,
 });
 } finally {
 setLoading(false);
 }
 };

 return (
 <div className="min-h-screen flex items-center justify-center bg-slate-50">
 <div className="max-w-md w-full space-y-8">
 <div>
 <h2 className="mt-6 text-center text-3xl font-extrabold text-brand-600">{t('auth.reset_password_heading')}</h2>
 <p className="mt-2 text-center text-sm text-slate-600">{t('auth.reset_password_description')}</p>
 </div>

 <form className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10" onSubmit={handleSubmit} noValidate>
 <div className="space-y-6">
 <div>
 <Label htmlFor="reset_new_password" className="block text-sm font-medium text-slate-700">
 {t('auth.new_password_label')}
 </Label>
 <Input
 id="reset_new_password"
 type="password"
 value={newPassword}
 onChange={(event) => {
 setNewPassword(event.target.value);
 if (error) setError('');
 }}
 aria-invalid={!!error}
 aria-describedby={error ? 'reset-password-error' : undefined}
 autoComplete="new-password"
 placeholder={t('auth.new_password_placeholder')}
 className="mt-1"
 />
 </div>

 <div>
 <Label htmlFor="reset_confirm_password" className="block text-sm font-medium text-slate-700">
 {t('auth.confirm_password_label')}
 </Label>
 <Input
 id="reset_confirm_password"
 type="password"
 value={confirmPassword}
 onChange={(event) => {
 setConfirmPassword(event.target.value);
 if (error) setError('');
 }}
 aria-invalid={!!error}
 aria-describedby={error ? 'reset-password-error' : undefined}
 autoComplete="new-password"
 placeholder={t('auth.confirm_password_placeholder')}
 className="mt-1"
 />
 {error && (
 <p id="reset-password-error" role="alert" aria-live="polite" className="mt-2 text-sm text-red-600">
 {error}
 </p>
 )}
 </div>

 <Button
 type="submit"
 disabled={loading || !newPassword}
 aria-busy={loading}
 className="w-full bg-brand-600 hover:bg-brand-700 text-white"
 >
 {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-label={t('auth.loading_label')} />}
 {t('auth.reset_password_submit')}
 </Button>

 <button
 type="button"
 className="w-full text-sm text-brand-600 hover:text-brand-500 font-medium"
 onClick={() => navigate('/login')}
 >
 {t('auth.back_to_sign_in')}
 </button>
 </div>
 </form>
 </div>
 </div>
 );
}
