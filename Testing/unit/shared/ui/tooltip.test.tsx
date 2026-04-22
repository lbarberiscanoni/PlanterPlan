import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/shared/ui/tooltip';

describe('Tooltip primitive (Wave 33)', () => {
    it('reveals content on hover', async () => {
        const user = userEvent.setup();
        render(
            <TooltipProvider delayDuration={0}>
                <Tooltip>
                    <TooltipTrigger>trigger</TooltipTrigger>
                    <TooltipContent>hello-from-tooltip</TooltipContent>
                </Tooltip>
            </TooltipProvider>,
        );

        // Tooltip is closed initially — content not in the DOM.
        expect(screen.queryByText('hello-from-tooltip')).not.toBeInTheDocument();

        await user.hover(screen.getByText('trigger'));

        await waitFor(() => {
            // Radix portals the tooltip and renders multiple copies (one for
            // screen readers, one visible). Any occurrence proves the open
            // transition fired.
            expect(screen.getAllByText('hello-from-tooltip').length).toBeGreaterThan(0);
        });
    });
});
