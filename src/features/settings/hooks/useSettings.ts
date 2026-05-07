import { useState, useEffect } from 'react';
import { useAuth } from '@/shared/contexts/auth-context';
import { planter } from '@/shared/api/planterClient';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

export interface UserProfile {
    full_name: string;
    email: string;
    role: string;
    organization: string;
    avatar_url: string;
    email_frequency: 'daily' | 'weekly' | 'never';
}

export interface PasswordForm {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
}

export function useSettings() {
    const { user } = useAuth();
    const { t } = useTranslation();

    const [loading, setLoading] = useState(false);
    const [avatarError, setAvatarError] = useState('');

    const [profile, setProfile] = useState<UserProfile>({
        full_name: '',
        email: '',
        role: '',
        organization: '',
        avatar_url: '',
        email_frequency: 'weekly',
    });

    const [passwordForm, setPasswordForm] = useState<PasswordForm>({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
    });
    const [passwordError, setPasswordError] = useState('');
    const [passwordLoading, setPasswordLoading] = useState(false);

    // Load initial data from User Metadata. The form must stay editable after hydration,
    // so derived-memo won't work; we intentionally seed state from the auth user.
    useEffect(() => {
        if (user) {
            setProfile({
                full_name: String(user.user_metadata?.full_name || ''),
                email: user.email || '',
                role: String(user.user_metadata?.role || ''),
                organization: String(user.user_metadata?.organization || ''),
                avatar_url: String(user.user_metadata?.avatar_url || ''),
                email_frequency: String(user.user_metadata?.email_frequency || 'daily') as UserProfile['email_frequency'],
            });
        }
    }, [user]);

    const handleSave = async () => {
        if (avatarError) return;

        setLoading(true);
        try {
            await planter.auth.updateProfile({
                full_name: profile.full_name,
                role: profile.role,
                organization: profile.organization,
                avatar_url: profile.avatar_url,
                email_frequency: profile.email_frequency,
            });

            toast.success(t('settings.profile.save_success_title'), {
                description: t('settings.profile.save_success_description'),
            });
        } catch (error) {
            console.error('Error updating profile:', error);
            toast.error(t('settings.profile.save_failed_title'), {
                description: t('settings.profile.save_failed_description'),
            });
        } finally {
            setLoading(false);
        }
    };

    const handlePasswordChange = async () => {
        setPasswordError('');

        if (!passwordForm.currentPassword) {
            setPasswordError(t('settings.security.current_password_required'));
            return;
        }

        if (passwordForm.newPassword.length < 8) {
            setPasswordError(t('settings.security.password_min_length'));
            return;
        }

        if (passwordForm.newPassword !== passwordForm.confirmPassword) {
            setPasswordError(t('settings.security.passwords_mismatch'));
            return;
        }

        setPasswordLoading(true);
        try {
            await planter.auth.changePassword(passwordForm.currentPassword, passwordForm.newPassword);
            toast.success(t('settings.security.password_updated_title'), {
                description: t('settings.security.password_updated_description'),
            });
            setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
        } catch (error) {
            console.error('Error changing password:', error);
            toast.error(t('settings.security.password_update_failed_title'), {
                description: t('settings.security.password_update_failed_description'),
            });
        } finally {
            setPasswordLoading(false);
        }
    };

    const validateAvatarUrl = (url: string) => {
        if (url && !url.match(/^https?:\/\/.+/)) {
            setAvatarError(t('settings.profile.avatar_url_invalid'));
        } else {
            setAvatarError('');
        }
    };

    return {
        state: {
            profile,
            loading,
            avatarError,
            passwordForm,
            passwordError,
            passwordLoading,
        },
        actions: {
            setProfile,
            setAvatarError,
            validateAvatarUrl,
            handleSave,
            setPasswordForm,
            setPasswordError,
            handlePasswordChange,
        }
    };
}
