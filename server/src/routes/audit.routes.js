// ════════════════════════════════════════════════════════════
//  Audit Log Routes
// ════════════════════════════════════════════════════════════
import { Router } from 'express';
import * as audit from '../controllers/audit.controller.js';
import { authenticate, requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';

const router = Router();

// Protect all routes with auth + RBAC audit:read permission
router.use(authenticate, requireAuth, requirePermission('audit:read'));

router.get('/', audit.list);
router.get('/user/:userId', audit.getByUser);

export default router;
