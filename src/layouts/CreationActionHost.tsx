import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { CreateProjectFormData } from '@/shared/db/app.types';
import type { CreateProjectPayload } from '@/features/projects/hooks/useProjectMutations';
import type { ProjectCreationInitialValues } from '@/features/projects/components/CreateProjectModal';
import CreateProjectModal from '@/features/projects/components/CreateProjectModal';
import CreateTemplateModal from '@/features/library/components/CreateTemplateModal';
import useMasterLibrarySearch from '@/features/library/hooks/useMasterLibrarySearch';
import { useCreateTemplate } from '@/features/library/hooks/useTemplateMutations';
import { useCreateProject } from '@/features/projects/hooks/useProjectMutations';
import { useAuth } from '@/shared/contexts/auth-context';

/**
 * Reads a non-empty query parameter.
 *
 * @param searchParams - Current URL search parameters.
 * @param key - Query parameter name to read.
 * @returns Trimmed parameter value, or undefined when absent.
 */
function optionalParam(searchParams: URLSearchParams, key: string) {
    const value = searchParams.get(key)?.trim();
    return value || undefined;
}

/**
 * Converts route action query parameters into initial project form values.
 *
 * @param searchParams - Current URL search parameters.
 * @returns Initial values for the create-project modal, when any were provided.
 */
function getProjectInitialValues(searchParams: URLSearchParams): ProjectCreationInitialValues | undefined {
    const initialValues: ProjectCreationInitialValues = {
        title: optionalParam(searchParams, 'title'),
        description: optionalParam(searchParams, 'description'),
        start_date: optionalParam(searchParams, 'start_date'),
        templateId: optionalParam(searchParams, 'templateId'),
        templateSeedKey: optionalParam(searchParams, 'template'),
    };

    return Object.values(initialValues).some(Boolean) ? initialValues : undefined;
}

/**
 * Hosts authenticated route-triggered project and template creation dialogs.
 *
 * @returns Project/template creation modal host.
 */
export default function CreationActionHost() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { user } = useAuth();
    const [searchParams, setSearchParams] = useSearchParams();
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showTemplateModal, setShowTemplateModal] = useState(false);
    const [projectInitialValues, setProjectInitialValues] = useState<ProjectCreationInitialValues | undefined>();
    const createProjectMutation = useCreateProject();
    const createTemplateMutation = useCreateTemplate();

    const {
        results: projectTemplateOptions,
        isLoading: projectTemplatesLoading,
    } = useMasterLibrarySearch({
        query: '',
        enabled: showCreateModal,
    });

    useEffect(() => {
        const action = searchParams.get('action');
        if (action !== 'new-project' && action !== 'new-template') return;

        if (action === 'new-project') {
            setProjectInitialValues(getProjectInitialValues(searchParams));
            setShowCreateModal(true);
        } else {
            setShowTemplateModal(true);
        }

        const nextParams = new URLSearchParams(searchParams);
        nextParams.delete('action');
        setSearchParams(nextParams, { replace: true });
    }, [searchParams, setSearchParams]);

    const handleCreateProject = async (projectData: CreateProjectFormData) => {
        try {
            const payload: CreateProjectPayload = {
                title: projectData.title,
                description: projectData.description,
                start_date: projectData.start_date,
                templateId: projectData.templateId ?? undefined,
            };
            const project = await createProjectMutation.mutateAsync(payload);
            if (project?.id) {
                navigate(`/project/${project.id}`);
            }
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : t('errors.unknown');
            toast.error(t('errors.failed_create_project'), { description: message });
        }
    };

    const handleCreateTemplate = async (data: { title: string; description: string; isPublished: boolean }) => {
        try {
            const userId = user?.id;
            if (!userId) throw new Error(t('errors.user_must_be_logged_in'));

            const template = await createTemplateMutation.mutateAsync({
                title: data.title,
                description: data.description,
                isPublished: data.isPublished,
                userId,
            });

            if (template?.id) {
                toast.success(t('library.template_created_toast'));
                navigate(`/project/${template.id}`);
            }
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : t('errors.unknown');
            toast.error(t('errors.failed_create_template'), { description: message });
        }
    };

    return (
        <>
            <CreateProjectModal
                open={showCreateModal}
                onClose={() => {
                    setShowCreateModal(false);
                    setProjectInitialValues(undefined);
                }}
                onSubmit={handleCreateProject}
                templates={projectTemplateOptions}
                templatesLoading={projectTemplatesLoading}
                initialValues={projectInitialValues}
                initialStep={projectInitialValues ? 2 : 1}
            />

            <CreateTemplateModal
                open={showTemplateModal}
                onClose={() => setShowTemplateModal(false)}
                onSubmit={handleCreateTemplate}
            />
        </>
    );
}
