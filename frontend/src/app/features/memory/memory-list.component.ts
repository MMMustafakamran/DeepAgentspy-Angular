/**
 * "Read and manage memory", verbatim. The `isAvailable()` gate is the point of
 * the sample: a runtime may not provide the memory routes at all.
 * https://docs.copilotkit.ai/angular/deepagents/guides/threads-memory-attachments-headless
 */
import { Component } from '@angular/core';
import { injectMemories } from '@copilotkit/angular';

@Component({
  selector: 'app-memory-list',
  template: `
    @if (!memory.isAvailable()) {
      <p>Memory is not available for this runtime.</p>
    } @else {
      @for (item of memory.memories(); track item.id) {
        <article>
          <p>{{ item.content }}</p>
          <button type="button" (click)="remove(item.id)">Forget</button>
        </article>
      }
    }
  `,
})
export class MemoryListComponent {
  readonly memory = injectMemories();

  protected remove(id: string): void {
    this.memory.removeMemory(id).catch(() => undefined);
  }

  protected addPreference(): void {
    this.memory
      .addMemory({
        kind: 'operational',
        content: 'Prefer concise status updates.',
      })
      .catch(() => undefined);
  }
}
