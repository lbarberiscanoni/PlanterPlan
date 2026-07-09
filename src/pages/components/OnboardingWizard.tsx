import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
 Dialog,
 DialogContent,
 DialogHeader,
 DialogTitle,
 DialogDescription,
 DialogFooter
} from '@/shared/ui/dialog';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { RadioGroup, RadioGroupItem } from '@/shared/ui/radio-group';
import { Loader2, ArrowRight, Calendar as CalendarIcon, X } from 'lucide-react';
import { Calendar } from '@/shared/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { formatDate } from '@/shared/lib/date-engine';
import { cn } from '@/shared/lib/utils';
import { track } from '@/shared/analytics/posthog';

interface OnboardingWizardProps {
 open: boolean;
 onCreateProject: (data: { title: string; due_date: string | null; template: string; status: string }) => Promise<void>;
 onDismiss?: () => void;
}

export default function OnboardingWizard({ open, onCreateProject, onDismiss }: OnboardingWizardProps) {
 const { t } = useTranslation();
 const [step, setStep] = useState(1);
 const [loading, setLoading] = useState(false);
 const [formData, setFormData] = useState({
 name: '',
 launchDate: null as Date | null,
 template: 'launch_large'
 });

 const handleNext = () => {
 setStep(step + 1);
 };

 const handleSubmit = async (e: React.FormEvent) => {
 if (e) e.preventDefault();
 setLoading(true);
 try {
 await onCreateProject({
 title: formData.name,
 due_date: formData.launchDate ? formatDate(formData.launchDate, 'yyyy-MM-dd') : null,
 template: formData.template,
 status: 'planning'
 });
 // Reached only when the 3-step wizard submits and the project is created.
 track('onboarding_completed', { steps_completed: 3, created_first_project: true });
 } catch (error) {
 console.error(error);
 } finally {
 setLoading(false);
 }
 };

 return (
 <Dialog open={open} onOpenChange={(val) => !val && onDismiss && onDismiss()}>
 <DialogContent data-testid="onboarding-wizard" className="sm:max-w-lg">
 <button
 onClick={onDismiss}
 aria-label={t('onboarding.close')}
 className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground"
 >
 <X className="h-4 w-4" />
 <span className="sr-only">{t('onboarding.close')}</span>
 </button>

 <DialogHeader>
 <div className="flex items-center justify-between mb-4">
 <DialogTitle className="text-xl">
 {step === 1 && t('onboarding.step1_title')}
 {step === 2 && t('onboarding.step2_title')}
 {step === 3 && t('onboarding.step3_title')}
 </DialogTitle>
 <span className="text-sm text-slate-400 font-medium">{t('onboarding.step_label', { step, total: 3 })}</span>
 </div>
 <DialogDescription>
 {step === 1 && t('onboarding.step1_description')}
 {step === 2 && t('onboarding.step2_description')}
 {step === 3 && t('onboarding.step3_description')}
 </DialogDescription>
 </DialogHeader>

 <div className="py-6 min-h-[200px]">
 {step === 1 && (
 <div className="space-y-4">
 <div className="space-y-2">
 <Label>{t('onboarding.church_name_label')}</Label>
 <Input
 placeholder={t('onboarding.church_name_placeholder')}
 value={formData.name}
 onChange={(e) => setFormData({ ...formData, name: e.target.value })}
 autoFocus
 className="h-11"
 />
 </div>
 </div>
 )}

 {step === 2 && (
 <div className="space-y-4">
 <div className="space-y-2">
 <Label>{t('onboarding.launch_date_label')}</Label>
 <Popover>
 <PopoverTrigger asChild>
 <Button
 type="button"
 variant="outline"
 className={cn(
 "w-full justify-start text-left font-normal h-11",
 !formData.launchDate && "text-muted-foreground"
 )}
 >
 <CalendarIcon className="mr-2 h-4 w-4" />
 {formData.launchDate ? formatDate(formData.launchDate, "PPP") : t('onboarding.launch_date_picker')}
 </Button>
 </PopoverTrigger>
 <PopoverContent className="w-auto p-0" align="start">
 <Calendar
 mode="single"
 selected={formData.launchDate as Date | undefined}
 onSelect={(date) => setFormData({ ...formData, launchDate: (date as Date | undefined) || null })}
 autoFocus
 />
 </PopoverContent>
 </Popover>
 <p className="text-xs text-slate-500">{t('onboarding.launch_date_reassurance')}</p>
 </div>
 </div>
 )}

 {step === 3 && (
 <div className="space-y-4">
 <RadioGroup value={formData.template} onValueChange={(val) => setFormData({ ...formData, template: val })}>
 <div className={cn(
 "flex items-start space-x-3 p-4 rounded-lg border cursor-pointer transition-all",
 formData.template === 'launch_large'
 ? "border-brand-500 bg-brand-50 ring-1 ring-brand-500/20"
 : "border-border hover:border-brand-300 hover:bg-slate-50 "
 )}>
 <RadioGroupItem value="launch_large" id="t1" className="mt-1" />
 <div className="flex-1">
 <Label htmlFor="t1" className="font-semibold cursor-pointer text-slate-900 ">{t('onboarding.template_launch_large_title')}</Label>
 <p className="text-sm text-slate-600 mt-1">{t('onboarding.template_launch_large_description')}</p>
 </div>
 </div>
 <div className={cn(
 "flex items-start space-x-3 p-4 rounded-lg border cursor-pointer transition-all",
 formData.template === 'multiplication'
 ? "border-brand-500 bg-brand-50 ring-1 ring-brand-500/20"
 : "border-border hover:border-brand-300 hover:bg-slate-50 "
 )}>
 <RadioGroupItem value="multiplication" id="t2" className="mt-1" />
 <div className="flex-1">
 <Label htmlFor="t2" className="font-semibold cursor-pointer text-slate-900 ">{t('onboarding.template_simple_title')}</Label>
 <p className="text-sm text-slate-600 mt-1">{t('onboarding.template_simple_description')}</p>
 </div>
 </div>
 </RadioGroup>
 </div>
 )}
 </div>

 <DialogFooter className="flex justify-between sm:justify-between items-center w-full">
 {step > 1 ? (
 <Button type="button" variant="ghost" onClick={() => setStep(step - 1)}>{t('common.back')}</Button>
 ) : (
 <Button type="button" variant="ghost" onClick={onDismiss} className="text-muted-foreground hover:text-foreground">{t('common.skip')}</Button>
 )}

 {step < 3 ? (
 <Button type="button" onClick={handleNext} disabled={!formData.name && step === 1}>
 {t('common.next')} <ArrowRight className="w-4 h-4 ml-2" />
 </Button>
 ) : (
 <Button type="button" onClick={handleSubmit} disabled={loading} className="bg-brand-600 hover:bg-brand-700 text-white">
 {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
 {t('onboarding.create_project')}
 </Button>
 )}
 </DialogFooter>
 </DialogContent>
 </Dialog>
 );
}
