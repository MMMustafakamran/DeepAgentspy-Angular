/**
 * Quickstart step "Add the chat UI", verbatim.
 * https://docs.copilotkit.ai/angular/deepagents/quickstart
 *
 * Only the selector and class name differ from the doc (which mounts this as
 * the app root); the template and imports are unchanged.
 */
import { Component } from '@angular/core';
import { CopilotChat } from '@copilotkit/angular';

@Component({
  selector: 'app-quickstart-chat',
  imports: [CopilotChat],
  template: `
    <div style="height: 100vh">
      <copilot-chat />
    </div>
  `,
})
export class QuickstartChat {}
