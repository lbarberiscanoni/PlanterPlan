/**
 * Derives a resource's "kind" from its URL — the resources catalog stores only a
 * name + URL, and the type (Google Doc, PDF, video, …) is inferred at display
 * time. Pure and synchronous; never touches the network.
 *
 * The icon is returned as a lucide icon NAME (string) so this shared module
 * stays dependency-light; the calling component maps the name to a component.
 */
export type ResourceKind =
    | 'google_doc'
    | 'google_sheet'
    | 'google_slides'
    | 'google_drive'
    | 'pdf'
    | 'word'
    | 'excel'
    | 'video'
    | 'web';

export interface ResourceKindInfo {
    kind: ResourceKind;
    /** i18n key under `resources.kinds.*`. */
    labelKey: string;
    /** lucide-react icon name; mapped to a component at the call site. */
    iconName: string;
}

const KIND_META: Record<ResourceKind, Omit<ResourceKindInfo, 'kind'>> = {
    google_doc: { labelKey: 'resources.kinds.google_doc', iconName: 'FileText' },
    google_sheet: { labelKey: 'resources.kinds.google_sheet', iconName: 'Sheet' },
    google_slides: { labelKey: 'resources.kinds.google_slides', iconName: 'Presentation' },
    google_drive: { labelKey: 'resources.kinds.google_drive', iconName: 'HardDrive' },
    pdf: { labelKey: 'resources.kinds.pdf', iconName: 'FileText' },
    word: { labelKey: 'resources.kinds.word', iconName: 'FileText' },
    excel: { labelKey: 'resources.kinds.excel', iconName: 'Sheet' },
    video: { labelKey: 'resources.kinds.video', iconName: 'Video' },
    web: { labelKey: 'resources.kinds.web', iconName: 'Globe' },
};

const info = (kind: ResourceKind): ResourceKindInfo => ({ kind, ...KIND_META[kind] });

/**
 * Classifies a URL into a {@link ResourceKind}. Falls back to `web` for
 * anything unrecognised or unparseable.
 */
export function detectResourceKind(url: string | null | undefined): ResourceKindInfo {
    if (!url) return info('web');

    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return info('web');
    }

    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    const path = parsed.pathname.toLowerCase();

    // Google Workspace surfaces.
    if (host === 'docs.google.com') {
        if (path.includes('/document/')) return info('google_doc');
        if (path.includes('/spreadsheets/')) return info('google_sheet');
        if (path.includes('/presentation/')) return info('google_slides');
        return info('google_drive');
    }
    if (host === 'drive.google.com') return info('google_drive');

    // Video hosts.
    if (host === 'youtube.com' || host === 'youtu.be' || host === 'vimeo.com') {
        return info('video');
    }

    // File extensions on the path.
    if (path.endsWith('.pdf')) return info('pdf');
    if (path.endsWith('.doc') || path.endsWith('.docx')) return info('word');
    if (path.endsWith('.xls') || path.endsWith('.xlsx') || path.endsWith('.csv')) return info('excel');

    return info('web');
}

/** The kinds, in display order, for building filter controls. */
export const RESOURCE_KINDS: ResourceKind[] = [
    'google_doc', 'google_sheet', 'google_slides', 'google_drive',
    'pdf', 'word', 'excel', 'video', 'web',
];
