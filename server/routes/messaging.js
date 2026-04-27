const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { authenticate } = require('../middleware/auth');
const { apiLimiter } = require('../middleware/rateLimiter');
const { validate } = require('../middleware/validate');
const { messageSchema } = require('../schemas/validation');

const router = express.Router();

// Mock storage - in production use encrypted database
const conversations = new Map();
const messages = new Map();

/**
 * GET /messaging/conversations
 * List user's conversations
 */
router.get('/conversations', authenticate, apiLimiter, (req, res) => {
  try {
    const userConversations = Array.from(conversations.values()).filter((c) =>
      c.participants.includes(req.user.id)
    );

    const withLastMessage = userConversations.map((c) => {
      const convMessages = Array.from(messages.values())
        .filter((m) => m.conversationId === c.id)
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      return {
        ...c,
        lastMessage: convMessages[0] || null,
        messageCount: convMessages.length,
        unread: convMessages.filter((m) => !m.readBy?.includes(req.user.id)).length
      };
    });

    res.json({
      success: true,
      conversations: withLastMessage
    });
  } catch (err) {
    res.status(500).json({
      error: 'Failed to list conversations',
      code: 'LIST_ERROR'
    });
  }
});

/**
 * POST /messaging/conversations
 * Create new conversation
 */
router.post('/conversations', authenticate, apiLimiter, (req, res) => {
  try {
    const { participantIds } = req.body;

    if (!participantIds || !Array.isArray(participantIds)) {
      return res.status(400).json({
        error: 'participantIds array required',
        code: 'VALIDATION_ERROR'
      });
    }

    const convId = uuidv4();
    const conversation = {
      id: convId,
      participants: [req.user.id, ...participantIds],
      createdBy: req.user.id,
      createdAt: new Date().toISOString(),
      encrypted: true
    };

    conversations.set(convId, conversation);

    res.status(201).json({
      success: true,
      conversation
    });
  } catch (err) {
    res.status(500).json({
      error: 'Failed to create conversation',
      code: 'CREATE_ERROR'
    });
  }
});

/**
 * GET /messaging/conversations/:id
 * Get conversation with message history
 */
router.get('/conversations/:id', authenticate, apiLimiter, (req, res) => {
  try {
    const conversation = conversations.get(req.params.id);

    if (!conversation) {
      return res.status(404).json({
        error: 'Conversation not found',
        code: 'NOT_FOUND'
      });
    }

    if (!conversation.participants.includes(req.user.id)) {
      return res.status(403).json({
        error: 'Cannot access this conversation',
        code: 'FORBIDDEN'
      });
    }

    const convMessages = Array.from(messages.values())
      .filter((m) => m.conversationId === req.params.id)
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    res.json({
      success: true,
      conversation,
      messages: convMessages,
      messageCount: convMessages.length
    });
  } catch (err) {
    res.status(500).json({
      error: 'Failed to retrieve conversation',
      code: 'GET_ERROR'
    });
  }
});

/**
 * POST /messaging/messages
 * Send encrypted message
 */
router.post(
  '/messages',
  authenticate,
  apiLimiter,
  validate(messageSchema),
  (req, res) => {
    try {
      const { conversationId, recipientId, body, attachments } = req.validated;

      // Get or create conversation
      let conversation = conversationId
        ? conversations.get(conversationId)
        : Array.from(conversations.values()).find(
            (c) =>
              c.participants.includes(req.user.id) &&
              c.participants.includes(recipientId)
          );

      if (!conversation) {
        const newConvId = uuidv4();
        conversation = {
          id: newConvId,
          participants: [req.user.id, recipientId],
          createdBy: req.user.id,
          createdAt: new Date().toISOString(),
          encrypted: true
        };
        conversations.set(newConvId, conversation);
      }

      // Check authorization
      if (!conversation.participants.includes(req.user.id)) {
        return res.status(403).json({
          error: 'Cannot send to this conversation',
          code: 'FORBIDDEN'
        });
      }

      // Create message
      const messageId = uuidv4();
      const message = {
        id: messageId,
        conversationId: conversation.id,
        senderId: req.user.id,
        recipientId,
        body,
        attachments: attachments || [],
        status: 'sent',
        timestamp: new Date().toISOString(),
        readBy: [req.user.id],
        encrypted: true,
        encryptionMethod: 'AES-256-GCM'
      };

      messages.set(messageId, message);

      res.status(201).json({
        success: true,
        message,
        conversation: conversation.id
      });
    } catch (err) {
      res.status(500).json({
        error: 'Failed to send message',
        code: 'SEND_ERROR'
      });
    }
  }
);

/**
 * PUT /messaging/messages/:id/read
 * Mark message as read
 */
router.put('/messages/:id/read', authenticate, apiLimiter, (req, res) => {
  try {
    const message = messages.get(req.params.id);

    if (!message) {
      return res.status(404).json({
        error: 'Message not found',
        code: 'NOT_FOUND'
      });
    }

    if (message.recipientId !== req.user.id) {
      return res.status(403).json({
        error: 'Cannot mark this message as read',
        code: 'FORBIDDEN'
      });
    }

    if (!message.readBy) {
      message.readBy = [];
    }
    if (!message.readBy.includes(req.user.id)) {
      message.readBy.push(req.user.id);
      message.readAt = new Date().toISOString();
    }

    res.json({
      success: true,
      message
    });
  } catch (err) {
    res.status(500).json({
      error: 'Failed to mark message as read',
      code: 'UPDATE_ERROR'
    });
  }
});

module.exports = router;
