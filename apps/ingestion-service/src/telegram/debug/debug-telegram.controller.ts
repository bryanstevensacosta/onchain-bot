import { Controller, Get, Param, Query } from '@nestjs/common';
import { TelegramClientManager } from '../shared/infrastructure/services/telegram-client-manager.service';

@Controller('debug/telegram')
export class DebugTelegramController {
  constructor(private readonly clientManager: TelegramClientManager) {}

  @Get('message/:channelId/:messageId')
  async getMessage(
    @Param('channelId') channelId: string,
    @Param('messageId') messageId: string,
  ) {
    const client = await this.clientManager.getClient();
    
    if (!client) {
      return { error: 'Telegram client not available' };
    }
    
    const entity = await client.getEntity(channelId);
    const messages = await client.getMessages(entity, {
      ids: [parseInt(messageId, 10)],
    });

    if (messages.length === 0) {
      return { error: 'Message not found' };
    }

    const message = messages[0];

    // Try to extract text using different methods
    let extractedText = message.message;
    
    // Try getText() method if available
    if (typeof (message as any).getText === 'function') {
      extractedText = await (message as any).getText();
    }

    // Check all possible text fields including forwarded message
    const allFields = {
      message: message.message,
      extractedText,
      text: (message as any).text,
      caption: (message as any).caption,
      isForwarded: !!(message as any).fwdFrom,
      fwdFrom: (message as any).fwdFrom,
      _text: (message as any)._text,
    };

    return {
      id: message.id,
      allTextFields: allFields,
      date: message.date,
      media: message.media
        ? {
            className: (message.media as any).className,
            hasCaption: !!(message.media as any).caption,
            caption: (message.media as any).caption,
          }
        : null,
      entities: message.entities,
      groupedId: message.groupedId,
    };
  }
}
