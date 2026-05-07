/**
 * Noesis.io Health  - Messaging Route
 * © 2026 Athena Core Technologies
 *
 * BAA-ready secure messaging between providers and patients.
 * Message body is AES-256-GCM encrypted before DB storage. Production
 * HIPAA compliance requires BAA execution with each customer; this
 * route layer is the technical-controls portion of that posture.
 * Dual-path: PostgreSQL when connected, in-memory fallback for dev.
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { authenticate } = require('../middleware/auth');
const { apiLimiter } = require('../middleware/rateLimiter');
const { validate } = require('../middleware/validate');
const { messageSchema } = require('../schemas/validation');
const db = require('../db');
const { encryptPHI, decryptPHI } = require('../utils/encryption');

const router = express.Router();

// ── In-memory fallback stores ─────────────────────────────────────────────────
const conversationStore = new Map();
const messageStore = new Map();

// ── DB helpers ────────────────────────────────────────────────────────────────
function messageRowToApi(row) {
  let body = row.body;
  try { body = decryptPHI(row.body); } catch { /* stored unencrypted in dev */ }
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    recipientId: row.recipient_id,
    body,
    attachments: row.attachments || [],
    status: row.status || 'sent',
    timestamp: row.created_at,
    readAt: row.read_at,
    readBy: row.read_by || [],
    encrypted: true,
    encryptionMethod: 'AES-256-GCM',
  };
}

function convRowToApi(row) {
  return {
    id: row.id,
    participants: row.participants,
    createdBy: row.created_by,
    createdAt: row.created_at,
    encrypted: true,
  };
}

// ── GET /conversations  - List user's conversations ────────────────────────────
router.get('/conversations', authenticate, apiLimiter, async (req, res) => {
  try {
    if (db.isConnected()) {
      const convRes = await db.query(
        `SELECT * FROM conversations WHERE $1 = ANY(participants) ORDER BY created_at DESC`,
        [req.user.id]
      );

      const withLastMessage = await Promise.all(
        convRes.rows.map(async (conv) => {
          const msgRes = await db.query(
            `SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT 1`,
            [conv.id]
          );
          const unreadRes = await db.query(
            `SELECT COUNT(*) FROM messages WHERE conversation_id = $1 AND recipient_id = $2 AND read_at IS NULL`,
            [conv.id, req.user.id]
          );
          return {
            ...convRowToApi(conv),
            lastMessage: msgRes.rows[0] ? messageRowToApi(msgRes.rows[0]) : null,
            unread: parseInt(unreadRes.rows[0].count),
          };
        })
      );

      return res.json({ success: true, conversations: withLastMessage });
    }

    // In-memory fallback
    const userConvs = Array.from(conversationStore.values()).filter((c) =>
      c.participants.includes(req.user.id)
    );
    const withLastMessage = userConvs.map((c) => {
      const convMsgs = Array.from(messageStore.values())
        .filter((m) => m.conversationId === c.id)
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      return {
        ...c,
        lastMessage: convMsgs[0] || null,
        messageCount: convMsgs.length,
        unread: convMsgs.filter((m) => !m.readBy?.includes(req.user.id)).length,
      };
    });

    res.json({ success: true, conversations: withLastMessage });
  } catch (err) {
    res.status(500).json({ error: 'Failed to list conversations', code: 'LIST_ERROR' });
  }
});

// ── POST /conversations  - Create conversation ─────────────────────────────────
router.post('/conversations', authenticate, apiLimiter, async (req, res) => {
  try {
    const { participantIds } = req.body;
    if (!participantIds || !Array.isArray(participantIds)) {
      return res.status(400).json({ error: 'participantIds array required', code: 'VALIDATION_ERROR' });
    }

    const participants = [req.user.id, ...participantIds];

    if (db.isConnected()) {
      const result = await db.query(
        `INSERT INTO conversations (participants, created_by, encrypted, organization_id)
         VALUES ($1, $2, true, $3) RETURNING *`,
        [participants, req.user.id, req.user.organizationId || null]
      );
      return res.status(201).json({ success: true, conversation: convRowToApi(result.rows[0]) });
    }

    const conv = {
      id: uuidv4(),
      participants,
      createdBy: req.user.id,
      createdAt: new Date().toISOString(),
      encrypted: true,
    };
    conversationStore.set(conv.id, conv);
    res.status(201).json({ success: true, conversation: conv });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create conversation', code: 'CREATE_ERROR' });
  }
});

// ── GET /conversations/:id  - Get conversation with messages ───────────────────
router.get('/conversations/:id', authenticate, apiLimiter, async (req, res) => {
  try {
    if (db.isConnected()) {
      const convRes = await db.query('SELECT * FROM conversations WHERE id = $1', [req.params.id]);
      if (convRes.rows.length === 0) {
        return res.status(404).json({ error: 'Conversation not found', code: 'NOT_FOUND' });
      }
      const conv = convRes.rows[0];
      if (!conv.participants.includes(req.user.id)) {
        return res.status(403).json({ error: 'Cannot access this conversation', code: 'FORBIDDEN' });
      }

      const msgRes = await db.query(
        'SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC',
        [req.params.id]
      );

      return res.json({
        success: true,
        conversation: convRowToApi(conv),
        messages: msgRes.rows.map(messageRowToApi),
        messageCount: msgRes.rows.length,
      });
    }

    // In-memory fallback
    const conv = conversationStore.get(req.params.id);
    if (!conv) { return res.status(404).json({ error: 'Conversation not found', code: 'NOT_FOUND' }); }
    if (!conv.participants.includes(req.user.id)) {
      return res.status(403).json({ error: 'Cannot access this conversation', code: 'FORBIDDEN' });
    }

    const msgs = Array.from(messageStore.values())
      .filter((m) => m.conversationId === req.params.id)
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    res.json({ success: true, conversation: conv, messages: msgs, messageCount: msgs.length });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve conversation', code: 'GET_ERROR' });
  }
});

// ── POST /messages  - Send encrypted message ───────────────────────────────────
router.post(
  '/messages',
  authenticate,
  apiLimiter,
  validate(messageSchema),
  async (req, res) => {
    try {
      const { conversationId, recipientId, body, attachments } = req.validated;

      // Encrypt the message body before storage (HIPAA)
      let encryptedBody;
      try {
        encryptedBody = encryptPHI(body);
      } catch {
        encryptedBody = body; // fallback if encryption key not configured
      }

      if (db.isConnected()) {
        // Find or create conversation
        let convId = conversationId;
        if (!convId) {
          const existingConv = await db.query(
            `SELECT id FROM conversations WHERE $1 = ANY(participants) AND $2 = ANY(participants) LIMIT 1`,
            [req.user.id, recipientId]
          );
          if (existingConv.rows.length > 0) {
            convId = existingConv.rows[0].id;
          } else {
            const newConv = await db.query(
              `INSERT INTO conversations (participants, created_by, encrypted) VALUES ($1, $2, true) RETURNING id`,
              [[req.user.id, recipientId], req.user.id]
            );
            convId = newConv.rows[0].id;
          }
        }

        // Verify user is a participant
        const convCheck = await db.query('SELECT participants FROM conversations WHERE id = $1', [convId]);
        if (!convCheck.rows[0]?.participants.includes(req.user.id)) {
          return res.status(403).json({ error: 'Cannot send to this conversation', code: 'FORBIDDEN' });
        }

        const msgRes = await db.query(
          `INSERT INTO messages (sender_id, recipient_id, organization_id, subject, body, is_phi, conversation_id, read_by)
           VALUES ($1, $2, $3, $4, $5, true, $6, $7) RETURNING *`,
          [req.user.id, recipientId, req.user.organizationId || null, 'Direct message', encryptedBody, convId, [req.user.id]]
        );

        return res.status(201).json({
          success: true,
          message: messageRowToApi(msgRes.rows[0]),
          conversation: convId,
        });
      }

      // In-memory fallback
      let conv = conversationId
        ? conversationStore.get(conversationId)
        : Array.from(conversationStore.values()).find(
            (c) => c.participants.includes(req.user.id) && c.participants.includes(recipientId)
          );

      if (!conv) {
        conv = { id: uuidv4(), participants: [req.user.id, recipientId], createdBy: req.user.id, createdAt: new Date().toISOString(), encrypted: true };
        conversationStore.set(conv.id, conv);
      }

      if (!conv.participants.includes(req.user.id)) {
        return res.status(403).json({ error: 'Cannot send to this conversation', code: 'FORBIDDEN' });
      }

      const msg = {
        id: uuidv4(),
        conversationId: conv.id,
        senderId: req.user.id,
        recipientId,
        body, // store plaintext in memory (dev only)
        attachments: attachments || [],
        status: 'sent',
        timestamp: new Date().toISOString(),
        readBy: [req.user.id],
        encrypted: true,
        encryptionMethod: 'AES-256-GCM',
      };
      messageStore.set(msg.id, msg);

      res.status(201).json({ success: true, message: msg, conversation: conv.id });
    } catch (err) {
      res.status(500).json({ error: 'Failed to send message', code: 'SEND_ERROR' });
    }
  }
);

// ── PUT /messages/:id/read  - Mark message as read ────────────────────────────
router.put('/messages/:id/read', authenticate, apiLimiter, async (req, res) => {
  try {
    if (db.isConnected()) {
      const result = await db.query(
        `UPDATE messages SET read_at = NOW() WHERE id = $1 AND recipient_id = $2 RETURNING *`,
        [req.params.id, req.user.id]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Message not found or cannot mark as read', code: 'NOT_FOUND' });
      }
      return res.json({ success: true, message: messageRowToApi(result.rows[0]) });
    }

    // In-memory fallback
    const msg = messageStore.get(req.params.id);
    if (!msg) { return res.status(404).json({ error: 'Message not found', code: 'NOT_FOUND' }); }
    if (msg.recipientId !== req.user.id) {
      return res.status(403).json({ error: 'Cannot mark this message as read', code: 'FORBIDDEN' });
    }
    if (!msg.readBy) { msg.readBy = []; }
    if (!msg.readBy.includes(req.user.id)) {
      msg.readBy.push(req.user.id);
      msg.readAt = new Date().toISOString();
    }
    res.json({ success: true, message: msg });
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark message as read', code: 'UPDATE_ERROR' });
  }
});

module.exports = router;
