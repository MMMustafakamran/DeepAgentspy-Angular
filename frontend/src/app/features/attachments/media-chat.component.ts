/**
 * "Enable attachments", verbatim. Without `onUpload`, files are read as base64
 * and travel inline with the message.
 * https://docs.copilotkit.ai/angular/deepagents/guides/threads-memory-attachments-headless
 */
import { Component } from '@angular/core';
import { CopilotChat, type AttachmentsConfig } from '@copilotkit/angular';

@Component({
  selector: 'app-media-chat',
  imports: [CopilotChat],
  template: ` <copilot-chat [attachments]="attachments" /> `,
})
export class MediaChatComponent {
  protected readonly attachments: AttachmentsConfig = {
    enabled: true,
    accept: 'image/*,application/pdf',
    maxSize: 10 * 1024 * 1024,
    onUploadFailed: (error) => {
      console.error(error.reason, error.message);
    },
  };
}
