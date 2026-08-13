/**
 * "Register the tool from the component or service that owns the decision UI",
 * verbatim. There is no handler — CopilotKit supplies one that waits for
 * `respond`, returns the decision to the agent, and continues the run.
 * https://docs.copilotkit.ai/angular/deepagents/guides/human-in-the-loop
 */
import { Injectable } from '@angular/core';
import { registerHumanInTheLoop } from '@copilotkit/angular';
import { z } from 'zod';

import { ApprovalCardComponent } from './approval-card.component';

@Injectable()
export class ApprovalToolsService {
  constructor() {
    registerHumanInTheLoop({
      name: 'requestApproval',
      description: 'Ask the user before a consequential action',
      parameters: z.object({
        action: z.string(),
        reason: z.string(),
      }),
      component: ApprovalCardComponent,
    });
  }
}
