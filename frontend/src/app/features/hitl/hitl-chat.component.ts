/**
 * Puts the guide's two human-in-the-loop paths side by side: the decision tool
 * (registered by ApprovalToolsService, rendered inside the chat's tool-call
 * flow) and the headless interrupt controller (rendered outside the chat).
 * https://docs.copilotkit.ai/angular/deepagents/guides/human-in-the-loop
 *
 * Injecting ApprovalToolsService is what constructs it, and construction is
 * what performs the `registerHumanInTheLoop` call.
 */
import { Component, inject } from '@angular/core';
import { CopilotChat } from '@copilotkit/angular';

import { ApprovalToolsService } from './approval-tools.service';
import { InterruptPanelComponent } from './interrupt-panel.component';

@Component({
  selector: 'app-hitl-chat',
  imports: [CopilotChat, InterruptPanelComponent],
  providers: [ApprovalToolsService],
  template: `
    <div style="display: flex; flex-direction: column; height: 100%">
      <app-interrupt-panel />
      <div style="flex: 1; min-height: 0">
        <copilot-chat />
      </div>
    </div>
  `,
})
export class HitlChatComponent {
  private readonly approvalTools = inject(ApprovalToolsService);
}
