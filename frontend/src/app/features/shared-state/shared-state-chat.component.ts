/**
 * Mounts the guide's three surfaces against one chat: the read/write state
 * panel, the accessor-based context, and the directive-based context.
 * https://docs.copilotkit.ai/angular/deepagents/guides/shared-state
 *
 * It also republishes the workspace state as readable context. `app-workspace`
 * writes priority through `agent.setState`, which updates the store the UI
 * reads -- but asking the agent "what is priority set as?" got an answer with
 * no knowledge of it, so that state is not reaching the model on this backend.
 *
 * The context below is what closes that gap, and it lives here rather than in
 * `workspace.component.ts` because that file is the guide's snippet verbatim
 * and has to stay that way. `connectAgentContext` is the same API the account
 * and selection panels on this page already use, so nothing new is introduced
 * -- the state is simply also sent the way the guide sends context.
 */
import { Component, computed } from '@angular/core';
import { CopilotChat, connectAgentContext, injectAgentStore } from '@copilotkit/angular';

import { AccountContextComponent } from './account-context.component';
import { SelectionContextComponent } from './selection-context.component';
import { WorkspaceComponent } from './workspace.component';

@Component({
  selector: 'app-shared-state-chat',
  imports: [
    CopilotChat,
    WorkspaceComponent,
    AccountContextComponent,
    SelectionContextComponent,
  ],
  template: `
    <div style="display: flex; height: 100%; gap: 1rem">
      <div style="width: 20rem; overflow-y: auto; padding: 1rem">
        <app-workspace />
        <app-account-context />
        <app-selection-context />
      </div>
      <div style="flex: 1; min-width: 0">
        <copilot-chat />
      </div>
    </div>
  `,
})
export class SharedStateChatComponent {
  private readonly store = injectAgentStore('default');

  /** The same object `app-workspace` renders, read through the store. */
  private readonly workspaceState = computed(
    () => this.store().state() as { notes?: string[]; priority?: string } | undefined,
  );

  constructor() {
    connectAgentContext(() => ({
      description: 'Current workspace state, including the priority setting',
      value: JSON.stringify({
        priority: this.workspaceState()?.priority ?? 'normal',
        notes: this.workspaceState()?.notes ?? [],
      }),
    }));
  }
}
