import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Switch } from '@/shared/ui/switch';
import {
 User,
 Lock,
 Bell,
 Loader2,
 Calendar,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useSettings } from '@/features/settings/hooks/useSettings';
import SettingsNotificationsTab from '@/pages/components/SettingsNotificationsTab';
import { LocaleSwitcher } from '@/features/settings/components/LocaleSwitcher';
import IcsFeedsCard from '@/features/settings/components/IcsFeedsCard';

type SettingsTab = 'profile' | 'security' | 'notifications' | 'integrations';

export default function Settings() {
 const { t } = useTranslation();
 const { state, actions } = useSettings();
 const { profile, loading, avatarError, passwordForm, passwordError, passwordLoading } = state;

 const [activeTab, setActiveTab] = useState<SettingsTab>('profile');

 return (
 <>
 <div className="max-w-4xl mx-auto px-4 py-8">
 <div className="mb-8">
 <h1 className="text-3xl font-bold text-foreground tracking-tight">{t('settings.page_title')}</h1>
 <p className="text-muted-foreground mt-2">{t('settings.page_subtitle')}</p>
 </div>

 <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
 {/* Settings Navigation */}
 <div className="md:col-span-1 space-y-1">
 {([
 { label: t('settings.tab_profile'), icon: User, tab: 'profile' as SettingsTab },
 { label: t('settings.tab_notifications'), icon: Bell, tab: 'notifications' as SettingsTab },
 { label: t('settings.tab_integrations'), icon: Calendar, tab: 'integrations' as SettingsTab },
 { label: t('settings.tab_security'), icon: Lock, tab: 'security' as SettingsTab },
 ] as Array<{ label: string; icon: React.ElementType; tab?: SettingsTab; comingSoon?: boolean }>).map((item) => (
 <Button
 key={item.label}
 variant="ghost"
 disabled={item.comingSoon}
 onClick={() => item.tab && setActiveTab(item.tab)}
 className={`w-full justify-start ${activeTab === item.tab
 ? 'text-brand-600 bg-brand-50 font-semibold'
 : 'text-muted-foreground'
 } ${item.comingSoon ? 'cursor-not-allowed opacity-70' : 'hover:text-foreground hover:bg-muted'}`}
 >
 <item.icon className="w-4 h-4 mr-2" />
 {item.label}
 {item.comingSoon && (
 <span className="ml-auto text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">{t('common.soon')}</span>
 )}
 </Button>
 ))}
 </div>

 {/* Content Area */}
 <div className="md:col-span-3">
 <motion.div key={activeTab} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>

 {/* Profile Tab */}
 {activeTab === 'profile' && (
 <div className="bg-card rounded-xl border border-border shadow-sm p-6">
 <div className="flex items-center gap-6 mb-8">
 <div className="relative">
 <div className="w-24 h-24 bg-secondary rounded-2xl flex items-center justify-center border-2 border-background shadow-md overflow-hidden">
 {profile.avatar_url ? (
 <img src={profile.avatar_url} alt={t('settings.profile.avatar_alt')} className="w-full h-full object-cover" />
 ) : (
 <User className="w-10 h-10 text-muted-foreground" />
 )}
 </div>
 </div>
 <div>
 <h2 className="text-xl font-bold text-slate-900">{t('settings.profile.personal_info')}</h2>
 <p className="text-sm text-slate-500">{t('settings.profile.personal_info_description')}</p>
 </div>
 </div>

 <form onSubmit={(e) => { e.preventDefault(); actions.handleSave(); }} className="space-y-4">
 <div className="grid grid-cols-2 gap-4">
 <div className="space-y-2">
 <Label htmlFor="full_name" className="text-foreground">{t('common.full_name')}</Label>
 <Input
 id="full_name"
 value={profile.full_name}
 onChange={(e) => actions.setProfile({ ...profile, full_name: e.target.value })}
 className="mt-1 bg-background border-border"
 />
 </div>
 <div className="space-y-2">
 <Label htmlFor="email">{t('common.email_address')}</Label>
 <Input
 id="email"
 type="email"
 value={profile.email}
 disabled
 className="bg-slate-50 border-slate-200"
 />
 </div>
 </div>

 <div className="flex flex-col space-y-2">
 <Label htmlFor="avatar_url" className="text-foreground">{t('settings.profile.avatar_url_label')}</Label>
 <Input
 id="avatar_url"
 value={profile.avatar_url}
 onChange={(e) => {
 actions.setProfile({ ...profile, avatar_url: e.target.value });
 if (avatarError) actions.setAvatarError('');
 }}
 onBlur={() => actions.validateAvatarUrl(profile.avatar_url)}
 className={`mt-1 bg-background border-border ${avatarError ? 'border-destructive focus:ring-destructive' : ''}`}
 placeholder={t('settings.profile.avatar_url_placeholder')}
 />
 {avatarError && <p className="text-xs text-destructive">{avatarError}</p>}
 </div>

 <div className="grid grid-cols-2 gap-4">
 <div className="space-y-2">
 <Label htmlFor="role">{t('settings.profile.role_label')}</Label>
 <Input
 id="role"
 value={profile.role}
 onChange={(e) => actions.setProfile({ ...profile, role: e.target.value })}
 placeholder={t('settings.profile.role_placeholder')}
 className="border-slate-200 focus:ring-orange-500/20 focus:border-orange-500"
 />
 </div>
 <div className="space-y-2">
 <Label htmlFor="org">{t('settings.profile.organization_label')}</Label>
 <Input
 id="org"
 value={profile.organization}
 onChange={(e) => actions.setProfile({ ...profile, organization: e.target.value })}
 placeholder={t('settings.profile.organization_placeholder')}
 className="border-slate-200 focus:ring-orange-500/20 focus:border-orange-500"
 />
 </div>
 </div>

 <div className="pt-6 border-t border-border">
 <h3 className="text-sm font-medium text-foreground mb-4">{t('settings.profile.language_heading')}</h3>
 <LocaleSwitcher />
 </div>

 <div className="pt-6 border-t border-border">
 <h3 className="text-sm font-medium text-foreground mb-4">{t('settings.profile.email_preferences_heading')}</h3>
 <div className="flex items-center justify-between">
 <div>
 <p className="text-sm font-medium text-foreground">{t('settings.profile.weekly_digest')}</p>
 <p className="text-sm text-muted-foreground">{t('settings.profile.weekly_digest_description')}</p>
 </div>
 <Switch
 checked={profile.email_frequency === 'weekly'}
 onCheckedChange={(checked) =>
 actions.setProfile({ ...profile, email_frequency: checked ? 'weekly' : 'never' })
 }
 />
 </div>
 </div>

 <div className="pt-6 border-t border-border flex justify-end">
 <Button
 onClick={actions.handleSave}
 disabled={loading}
 type="button"
 className="bg-brand-600 hover:bg-brand-700 text-white"
 >
 {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
 {t('common.save_changes')}
 </Button>
 </div>
 </form>
 </div>
 )}

 {/* Notifications Tab (Wave 30) */}
 {activeTab === 'notifications' && (
 <SettingsNotificationsTab />
 )}

 {/* Integrations Tab (Wave 35) */}
 {activeTab === 'integrations' && (
 <IcsFeedsCard />
 )}

 {/* Security Tab */}
 {activeTab === 'security' && (
 <div className="bg-card rounded-xl border border-border shadow-sm p-6">
 <div className="mb-8">
 <h2 className="text-xl font-bold text-slate-900">{t('settings.security.change_password_heading')}</h2>
 <p className="text-sm text-slate-500 mt-1">{t('settings.security.change_password_description')}</p>
 </div>

 <form
 onSubmit={(e) => { e.preventDefault(); actions.handlePasswordChange(); }}
 className="space-y-4"
 >
 <div className="space-y-2">
 <Label htmlFor="new_password" className="text-foreground">{t('settings.security.new_password_label')}</Label>
 <Input
 id="new_password"
 type="password"
 value={passwordForm.newPassword}
 onChange={(e) => actions.setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
 onFocus={() => { if (passwordError) actions.setPasswordError(''); }}
 placeholder={t('settings.security.new_password_placeholder')}
 className="bg-background border-border"
 autoComplete="new-password"
 />
 </div>

 <div className="space-y-2">
 <Label htmlFor="confirm_password" className="text-foreground">{t('settings.security.confirm_password_label')}</Label>
 <Input
 id="confirm_password"
 type="password"
 value={passwordForm.confirmPassword}
 onChange={(e) => actions.setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
 onFocus={() => { if (passwordError) actions.setPasswordError(''); }}
 placeholder={t('settings.security.confirm_password_placeholder')}
 className={`bg-background border-border ${passwordError ? 'border-destructive focus:ring-destructive' : ''}`}
 autoComplete="new-password"
 />
 {passwordError && (
 <p className="text-xs text-destructive">{passwordError}</p>
 )}
 </div>

 <div className="pt-6 border-t border-border flex justify-end">
 <Button
 type="submit"
 disabled={passwordLoading || !passwordForm.newPassword}
          className="bg-brand-500 hover:bg-brand-600 text-white"
 >
 {passwordLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
 {t('settings.security.change_password_button')}
 </Button>
 </div>
 </form>
 </div>
 )}

 </motion.div>
 </div>
 </div>
 </div >
 </>
 );
}
