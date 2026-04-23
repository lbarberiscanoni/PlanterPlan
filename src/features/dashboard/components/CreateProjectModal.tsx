import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/shared/ui/dialog';
import { Button } from '@/shared/ui/button';
import { toIsoDate, nowUtcIso } from '@/shared/lib/date-engine';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Textarea } from '@/shared/ui/textarea';
import {
    Plus,
    Target,
    ChevronRight,
    ArrowLeft,
    Check,
    Loader2,
    Search,
    FileText,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import useMasterLibrarySearch from '@/features/library/hooks/useMasterLibrarySearch';
import { useDirtyCloseGuard } from '@/shared/lib/use-dirty-close-guard';

import type { CreateProjectFormData } from '@/shared/db/app.types';

/** Special ID for the built-in default scaffold (not a real DB template). */
const DEFAULT_SCAFFOLD_ID = '__default__';

interface CreateProjectModalProps {
    open: boolean;
    onClose: () => void;
    onSubmit: (data: CreateProjectFormData) => Promise<void>;
}

export default function CreateProjectModal({ open, onClose, onSubmit }: CreateProjectModalProps) {
    const { t } = useTranslation();
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [formData, setFormData] = useState<CreateProjectFormData>({
        title: '',
        description: '',
        templateId: DEFAULT_SCAFFOLD_ID,
        start_date: toIsoDate(nowUtcIso()) || '',
    });

    const { results: dbTemplates, isLoading: templatesLoading } = useMasterLibrarySearch({
        query: '',
        enabled: open,
    });

    // Filter templates that are root-level (no parent) for project creation
    const rootTemplates = useMemo(() => {
        return (dbTemplates || []).filter((t) => !t.parent_task_id);
    }, [dbTemplates]);

    const filteredTemplates = useMemo(() => {
        if (!searchQuery.trim()) return rootTemplates;
        const q = searchQuery.toLowerCase();
        return rootTemplates.filter(
            (t) => t.title?.toLowerCase().includes(q) || t.description?.toLowerCase().includes(q)
        );
    }, [rootTemplates, searchQuery]);

    // Dirty = user typed a title/description or changed the template away
    // from the default scaffold. Step changes alone don't count — the user
    // can wander the wizard without committing. Start date defaults to
    // today; shifting it should prompt because it's explicit intent.
    const isDirty =
        (formData.title?.trim().length ?? 0) > 0 ||
        (formData.description?.trim().length ?? 0) > 0 ||
        formData.templateId !== DEFAULT_SCAFFOLD_ID;
    const guardedClose = useDirtyCloseGuard(isDirty, onClose);

    const handleNext = () => setStep(2);
    const handleBack = () => setStep(1);

    const handleTemplateSelect = (templateId: string) => {
        setFormData({ ...formData, templateId });
    };

    const handleSubmit = async () => {
        setLoading(true);
        try {
            const submitData = { ...formData };
            // If default scaffold, strip templateId so useCreateProject takes the blank path
            if (submitData.templateId === DEFAULT_SCAFFOLD_ID) {
                delete (submitData as Partial<CreateProjectFormData>).templateId;
            }
            await onSubmit(submitData);
            onClose();
        } catch (error) {
            console.error('Failed to create project:', error);
        } finally {
            setLoading(false);
            setStep(1);
            setSearchQuery('');
            setFormData({
                title: '',
                description: '',
                templateId: DEFAULT_SCAFFOLD_ID,
                start_date: toIsoDate(nowUtcIso()) || '',
            });
        }
    };

    return (
        <Dialog open={open} onOpenChange={(o) => { if (!o) void guardedClose(); }}>
            <DialogContent data-testid="create-project-modal" className="sm:max-w-[600px] p-0 overflow-hidden bg-white border-slate-200">
                <DialogHeader className="p-8 bg-brand-600 text-white">
                    <DialogTitle className="text-2xl font-bold flex items-center gap-2">
                        <Plus className="w-6 h-6" />
                        {t('dashboard.create_project_modal.title')}
                    </DialogTitle>
                    <DialogDescription className="text-brand-100 text-base">
                        {t('dashboard.create_project_modal.subtitle')}
                    </DialogDescription>
                </DialogHeader>

                <div className="p-8">
                    <div className="flex items-center justify-center mb-8">
                        <div className="flex items-center gap-4">
                            {[1, 2].map((i) => (
                                <div key={i} className="flex items-center">
                                    <div
                                        className={cn(
                                            'w-10 h-10 rounded-full flex items-center justify-center font-bold transition-all duration-300',
                                            step >= i
                                                ? 'bg-brand-600 text-white shadow-lg shadow-brand-200'
                                                : 'bg-slate-100 text-slate-400'
                                        )}
                                    >
                                        {step > i ? <Check className="w-5 h-5" /> : i}
                                    </div>
                                    {i === 1 && (
                                        <div
                                            className={cn(
                                                'w-20 h-1 mx-2 rounded-full transition-all duration-500',
                                                step > 1 ? 'bg-brand-600' : 'bg-slate-100'
                                            )}
                                        />
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Wizard steps — framer-motion slide animation removed with
                      * the rest of the framer-motion dep (-125 KB gzipped). The
                      * step separation remains visible via the step indicator
                      * at the top + the Back/Continue buttons. */}
                    {step === 1 ? (
                            <div
                                key="step1"
                                className="space-y-4 animate-slide-up"
                            >
                                {/* Search input */}
                                {rootTemplates.length > 3 && (
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                        <Input
                                            placeholder={t('dashboard.create_project_modal.search_templates_placeholder')}
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            className="pl-10 h-10 rounded-xl border-slate-200"
                                        />
                                    </div>
                                )}

                                <div className="grid grid-cols-1 gap-3 max-h-80 overflow-y-auto pr-1">
                                    {/* Default scaffold option */}
                                    {!searchQuery && (
                                        <div
                                            onClick={() => handleTemplateSelect(DEFAULT_SCAFFOLD_ID)}
                                            className={cn(
                                                'group cursor-pointer p-4 rounded-xl border-2 transition-all duration-300 flex items-center gap-4',
                                                formData.templateId === DEFAULT_SCAFFOLD_ID
                                                    ? 'border-brand-600 bg-brand-50 shadow-md ring-1 ring-brand-600/10'
                                                    : 'border-slate-100 hover:border-brand-200 hover:bg-slate-50'
                                            )}
                                        >
                                            <div
                                                className={cn(
                                                    'w-12 h-12 rounded-xl flex items-center justify-center transition-colors',
                                                    formData.templateId === DEFAULT_SCAFFOLD_ID
                                                        ? 'bg-brand-600 text-white'
                                                        : 'bg-brand-50 text-brand-600'
                                                )}
                                            >
                                                <Target className="w-6 h-6" />
                                            </div>
                                            <div className="flex-1">
                                                <h4 className="font-bold text-slate-900">{t('dashboard.create_project_modal.new_church_plant')}</h4>
                                                <p className="text-sm text-slate-500">{t('dashboard.create_project_modal.scaffold_description')}</p>
                                            </div>
                                            {formData.templateId === DEFAULT_SCAFFOLD_ID && (
                                                <div className="w-6 h-6 rounded-full bg-brand-600 flex items-center justify-center">
                                                    <Check className="w-4 h-4 text-white" />
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Dynamic templates from DB */}
                                    {templatesLoading ? (
                                        <div className="flex items-center justify-center py-6 text-slate-400">
                                            <Loader2 className="w-5 h-5 animate-spin mr-2" />
                                            {t('dashboard.create_project_modal.loading_templates')}
                                        </div>
                                    ) : (
                                        filteredTemplates.map((template) => (
                                            <div
                                                key={template.id}
                                                onClick={() => handleTemplateSelect(template.id)}
                                                className={cn(
                                                    'group cursor-pointer p-4 rounded-xl border-2 transition-all duration-300 flex items-center gap-4',
                                                    formData.templateId === template.id
                                                        ? 'border-brand-600 bg-brand-50 shadow-md ring-1 ring-brand-600/10'
                                                        : 'border-slate-100 hover:border-brand-200 hover:bg-slate-50'
                                                )}
                                            >
                                                <div
                                                    className={cn(
                                                        'w-12 h-12 rounded-xl flex items-center justify-center transition-colors',
                                                        formData.templateId === template.id
                                                            ? 'bg-brand-600 text-white'
                                                            : 'bg-slate-100 text-slate-500'
                                                    )}
                                                >
                                                    <FileText className="w-6 h-6" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <h4 className="font-bold text-slate-900 truncate">{template.title}</h4>
                                                    {template.description && (
                                                        <p className="text-sm text-slate-500 truncate">{template.description}</p>
                                                    )}
                                                </div>
                                                {formData.templateId === template.id && (
                                                    <div className="w-6 h-6 rounded-full bg-brand-600 flex items-center justify-center flex-shrink-0">
                                                        <Check className="w-4 h-4 text-white" />
                                                    </div>
                                                )}
                                            </div>
                                        ))
                                    )}

                                    {!templatesLoading && searchQuery && filteredTemplates.length === 0 && (
                                        <p className="text-sm text-slate-500 text-center py-4">{t('dashboard.create_project_modal.no_templates_match')}</p>
                                    )}
                                </div>

                                <Button
                                    onClick={handleNext}
                                    className="w-full bg-brand-600 hover:bg-brand-700 text-white h-12 text-lg font-semibold rounded-xl"
                                >
                                    {t('dashboard.create_project_modal.continue_to_details')}
                                    <ChevronRight className="ml-2 w-5 h-5" />
                                </Button>
                            </div>
                        ) : (
                            <div
                                key="step2"
                                className="space-y-6 animate-slide-up"
                            >
                                <h3 className="text-lg font-bold text-slate-900">{t('dashboard.create_project_modal.project_details')}</h3>
                                <div className="space-y-2">
                                    <Label htmlFor="title" className="text-slate-700 font-semibold">
                                        {t('dashboard.create_project_modal.project_name')}
                                    </Label>
                                    <Input
                                        id="title"
                                        placeholder={t('dashboard.create_project_modal.project_name_placeholder')}
                                        value={formData.title}
                                        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                        className="h-12 border-slate-200 focus:ring-brand-500/20 focus:border-brand-500 rounded-xl"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="description" className="text-slate-700 font-semibold">
                                        {t('dashboard.create_project_modal.description')}
                                    </Label>
                                    <Textarea
                                        id="description"
                                        placeholder={t('dashboard.create_project_modal.description_placeholder')}
                                        value={formData.description}
                                        onChange={(e) =>
                                            setFormData({ ...formData, description: e.target.value })
                                        }
                                        className="min-h-[120px] border-slate-200 focus:ring-brand-500/20 focus:border-brand-500 rounded-xl resize-none"
                                    />
                                </div>
                                <div className="flex gap-4">
                                    <Button
                                        variant="outline"
                                        onClick={handleBack}
                                        className="flex-1 border-slate-200 text-slate-600 h-12 rounded-xl"
                                    >
                                        <ArrowLeft className="mr-2 w-5 h-5" />
                                        {t('common.back')}
                                    </Button>
                                    <Button
                                        onClick={handleSubmit}
                                        disabled={loading || !formData.title}
                                        className="flex-[2] bg-brand-600 hover:bg-brand-700 text-white h-12 text-lg font-semibold rounded-xl"
                                    >
                                        {loading ? (
                                            <Loader2 className="w-6 h-6 animate-spin" />
                                        ) : (
                                            t('dashboard.create_project_modal.create_project')
                                        )}
                                    </Button>
                                </div>
                            </div>
                        )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
