const express = require('express');
const router = express.Router();
const checklistController = require('../controllers/checklistController');
const authMiddleware = require('../utils/authMiddleware');

router.use(authMiddleware);

// Fast stats for dashboard (counts only)
router.get('/dashboard-stats', checklistController.getDashboardStats);

// Collection routes
router.get('/all', checklistController.getAllChecklists);
router.get('/my-lists', checklistController.getMyChecklists);
router.get('/other-lists', checklistController.getOtherChecklists);
router.get('/my-private-lists', checklistController.getMyPrivateChecklists);
// test mail automation
// router.get('/test-deletion-email', checklistController.testDeletionEmail);
// test mail automation
router.post('/', checklistController.createChecklist);

// Specific list / item routes
router.get('/:list_id', checklistController.getChecklistById);
router.put('/:checklistId', checklistController.updateChecklist);
// Route to delete a single list
router.delete('/:id', checklistController.deleteChecklist);
// Route to delete a single list item
router.delete('/:checklistId/items/:itemId', checklistController.deleteListItem);
// Add a single item to a checklist
router.post('/:id/items', checklistController.addItemToChecklist);
// Toggle/Update a single list item completion status
router.patch('/:checklistId/items/:itemId/complete', checklistController.toggleListItemComplete);
// Route to freeze/unfreeze a checklist
router.patch('/:id/freeze', checklistController.toggleFreezeChecklist);
// Route to reorder checklist items
router.patch('/:id/reorder', checklistController.reorderChecklistItems);

module.exports = router;