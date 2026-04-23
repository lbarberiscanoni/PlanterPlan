import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useAuth } from '@/shared/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const LoginForm = () => {
 const { t } = useTranslation();
 const [isSignUp, setIsSignUp] = useState(false);
 const [loading, setLoading] = useState(false);

 const { signIn, signUp } = useAuth();
 const navigate = useNavigate();

 const loginSchema = useMemo(
  () =>
   z.object({
    email: z.string().email(t('auth.invalid_email')),
    password: z.string().min(6, t('auth.password_too_short')),
   }),
  [t],
 );

 const {
 register,
 handleSubmit,
 formState: { errors },
 } = useForm({
 resolver: zodResolver(loginSchema),
 defaultValues: {
 email: '',
 password: '',
 },
 });

 const onSubmit = async (data: z.infer<typeof loginSchema>) => {
 setLoading(true);

 try {
 let result;
 if (isSignUp) {
 result = await signUp(data.email, data.password);
 } else {
 result = await signIn(data.email, data.password);
 }

 if (result.error) {
 throw result.error;
 } else {
 navigate('/dashboard');
 }
 } catch (err: unknown) {
 toast.error(isSignUp ? t('errors.signup_failed') : t('errors.login_failed'), {
 description: err instanceof Error ? err.message : t('auth.unexpected_error'),
 });
 } finally {
 setLoading(false);
 }
 };

 return (
 <div className="min-h-screen flex items-center justify-center bg-slate-50">
 <div className="max-w-md w-full space-y-8">
 <div>
 <h2 className="mt-6 text-center text-3xl font-extrabold text-brand-600">{t('auth.app_name')}</h2>
 <p className="mt-2 text-center text-sm text-slate-600">
 {isSignUp ? t('auth.create_account') : t('auth.sign_in_prompt')}
 </p>
 </div>

 <form className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10" onSubmit={handleSubmit(onSubmit)}>
 <div className="space-y-6">
 <div>
 <label htmlFor="email" className="block text-sm font-medium text-slate-700">
 {t('auth.email_label')}
 </label>
 <input
 id="email"
 type="email"
 autoComplete="username"
 aria-invalid={!!errors.email}
 aria-describedby={errors.email ? 'email-error' : undefined}
 className={`mt-1 appearance-none relative block w-full px-3 py-2 border ${errors.email ? 'border-red-500' : 'border-slate-300'} placeholder-slate-400 rounded focus:outline-none focus:ring-brand-500 focus:border-brand-500`}
 placeholder={t('auth.email_placeholder')}
 {...register('email')}
 />
 {/* Dark red text (#dc2626) instead of #ef4444 to clear 4.5:1 contrast
  * on white backgrounds for WCAG 1.4.3. role="alert" + aria-live so
  * SRs announce the error immediately without polling the input. */}
 {errors.email && (
 <p id="email-error" data-testid="email-error" role="alert" aria-live="polite" className="mt-1 text-sm text-red-600">{errors.email.message}</p>
 )}
 </div>

 <div>
 <label htmlFor="password" className="block text-sm font-medium text-slate-700">
 {t('auth.password_label')}
 </label>
 <input
 id="password"
 type="password"
 autoComplete={isSignUp ? 'new-password' : 'current-password'}
 aria-invalid={!!errors.password}
 aria-describedby={errors.password ? 'password-error' : undefined}
 className={`mt-1 appearance-none relative block w-full px-3 py-2 border ${errors.password ? 'border-red-500' : 'border-slate-300'} placeholder-slate-400 rounded focus:outline-none focus:ring-brand-500 focus:border-brand-500`}
 placeholder={t('auth.password_placeholder')}
 {...register('password')}
 />
 {errors.password && (
 <p id="password-error" data-testid="password-error" role="alert" aria-live="polite" className="mt-1 text-sm text-red-600">{errors.password.message}</p>
 )}
 </div>

 <div>
 <button
 type="submit"
 disabled={loading}
 aria-busy={loading}
 className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-brand-600 hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-500/20 disabled:opacity-50 transition-colors shadow-sm"
 >
 {loading ? <Loader2 className="w-5 h-5 animate-spin" data-testid="loading-spinner" aria-label={t('auth.loading_label')} /> : (isSignUp ? t('auth.sign_up') : t('auth.sign_in'))}
 </button>
 </div>

 {String(import.meta.env.VITE_E2E_MODE) === 'true' && (
 <button
 type="button"
 className="mt-4 w-full text-sm text-slate-500 hover:text-slate-700 underline"
 onClick={(e) => {
 e.preventDefault();
 const email = String(import.meta.env.VITE_TEST_EMAIL || '');
 const password = String(import.meta.env.VITE_TEST_PASSWORD || '');
 signIn(email, password);
 }}
 >
 {t('auth.auto_login')}
 </button>
 )}

 <div className="text-center">
 <button
 type="button"
 className="text-sm text-brand-600 hover:text-brand-500 font-medium"
 onClick={() => setIsSignUp(!isSignUp)}
 >
 {isSignUp ? t('auth.have_account') : t('auth.need_account')}
 </button>
 </div>

 </div>
 </form>
 </div>
 </div>
 );
};

export default LoginForm;
