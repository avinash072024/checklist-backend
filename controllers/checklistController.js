const Checklist = require('../models/Checklist');

// 1. Get checklists created ONLY by the authenticated user
exports.getMyChecklists = async (req, res) => {
    try {
        const userId = req.user.userId || req.user.id;
        const lists = await Checklist.find({ createdBy: userId })
            .populate('listItems.completedBy', 'username firstName lastName fullname')
            .populate('listItems.createdBy', 'username firstName lastName fullname')
            .populate('createdBy', 'username firstName lastName fullname')
            .populate('frozenBy', 'username firstName lastName fullname');

        res.json({ success: true, count: lists.length, data: lists });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// 2. Get checklists created by OTHER users
exports.getOtherChecklists = async (req, res) => {
    try {
        const userId = req.user.userId || req.user.id;
        const lists = await Checklist.find({ createdBy: { $ne: userId } })
            .populate('listItems.completedBy', 'username firstName lastName fullname')
            .populate('listItems.createdBy', 'username firstName lastName fullname')
            .populate('createdBy', 'username firstName lastName fullname')
            .populate('frozenBy', 'username firstName lastName fullname');

        res.json({ success: true, count: lists.length, data: lists });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// Get ALL checklists in the system
exports.getAllChecklists = async (req, res) => {
    try {
        const lists = await Checklist.find({}).sort({ createdAt: -1 })
            .populate('listItems.completedBy', 'username firstName lastName fullname')
            .populate('listItems.createdBy', 'username firstName lastName fullname')
            .populate('createdBy', 'username firstName lastName fullname')
            .populate('frozenBy', 'username firstName lastName fullname');

        res.json({ success: true, count: lists.length, data: lists });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// Get a single checklist by ID
exports.getChecklistById = async (req, res) => {
    try {
        const { list_id } = req.params;
        const checklist = await Checklist.findById(list_id)
            .populate('listItems.completedBy', 'username firstName lastName fullname')
            .populate('listItems.createdBy', 'username firstName lastName fullname')
            .populate('createdBy', 'username firstName lastName fullname')
            .populate('frozenBy', 'username firstName lastName fullname'); // <-- Added here

        if (!checklist) {
            return res.status(404).json({ success: false, message: 'Checklist not found' });
        }

        res.json({ success: true, data: checklist });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// Create a new checklist (allows creation with just a title and optional items)
exports.createChecklist = async (req, res) => {
    try {
        const { title, listItems } = req.body;
        const userId = req.user.userId || req.user.id;

        if (!title || !title.trim()) {
            return res.status(400).json({ success: false, message: 'Checklist title is required.' });
        }

        let formattedItems = [];

        if (listItems && Array.isArray(listItems) && listItems.length > 0) {
            const itemTexts = new Set();
            for (const item of listItems) {
                const textValue = (typeof item === 'string' ? item : item.text).trim().toLowerCase();

                if (itemTexts.has(textValue)) {
                    return res.status(400).json({
                        success: false,
                        message: `Duplicate item name found in list: "${textValue}"`
                    });
                }
                itemTexts.add(textValue);
            }

            formattedItems = listItems.map(item => ({
                text: (typeof item === 'string' ? item : item.text).trim(),
                completed: false,
                completedBy: null,
                createdBy: userId // <-- Assign logged-in user ID here
            }));
        }

        const newList = new Checklist({
            title: title.trim(),
            listItems: formattedItems,
            createdBy: userId,
            isFreeze: false
        });

        await newList.save();
        res.status(201).json({ success: true, message: 'List created successfully', data: newList });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// Update entire checklist or its full list items array with duplicate checking
exports.updateChecklist = async (req, res) => {
    try {
        const checklistId = req.params.id || req.params.checklistId;
        const { title, listItems, isFreeze } = req.body;
        const userId = req.user.userId || req.user.id;

        const checklist = await Checklist.findById(checklistId);
        if (!checklist) {
            return res.status(404).json({ success: false, message: `Checklist not found for ID: ${checklistId}` });
        }

        if (checklist.isFreeze) {
            return res.status(400).json({ success: false, message: 'This checklist is completed and cannot be modified.' });
        }

        if (title !== undefined) checklist.title = title.trim();
        if (isFreeze !== undefined) checklist.isFreeze = isFreeze;

        if (listItems) {
            const itemTexts = new Set();
            for (const item of listItems) {
                const textValue = (typeof item === 'string' ? item : item.text).trim().toLowerCase();

                if (itemTexts.has(textValue)) {
                    return res.status(400).json({
                        success: false,
                        message: `Duplicate item name found in list: "${textValue}"`
                    });
                }
                itemTexts.add(textValue);
            }

            checklist.listItems = listItems.map((newItem, index) => {
                const existingItem = checklist.listItems[index];
                const textVal = (typeof newItem === 'string' ? newItem : newItem.text).trim();

                let completedBy = existingItem ? existingItem.completedBy : null;
                if (newItem.completed && (!existingItem || !existingItem.completed)) {
                    completedBy = userId;
                } else if (!newItem.completed) {
                    completedBy = null;
                }

                // Preserve original item creator, or assign current logged-in user for new items
                const itemCreator = existingItem && existingItem.createdBy ? existingItem.createdBy : userId;

                return {
                    text: textVal,
                    completed: newItem.completed !== undefined ? newItem.completed : (existingItem ? existingItem.completed : false),
                    completedBy: completedBy,
                    createdBy: itemCreator
                };
            });
        }

        const updatedList = await checklist.save();
        res.json({ success: true, message: 'Checklist updated successfully', data: updatedList });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// Delete checklist
exports.deleteChecklist = async (req, res) => {
    try {
        const { id } = req.params;
        await Checklist.findByIdAndDelete(id);
        res.json({ success: true, message: 'Checklist deleted successfully' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// Delete a single list item from a checklist
exports.deleteListItem = async (req, res) => {
    try {
        const { checklistId, itemId } = req.params;

        const checklist = await Checklist.findById(checklistId);
        if (!checklist) {
            return res.status(404).json({ success: false, message: 'Checklist not found' });
        }

        if (checklist.isFreeze) {
            return res.status(400).json({ success: false, message: 'This checklist is completed and cannot be modified.' });
        }

        // Find the specific item index or use Mongoose subdocument pull
        const item = checklist.listItems.id(itemId);
        if (!item) {
            return res.status(404).json({ success: false, message: 'List item not found' });
        }

        checklist.listItems.pull(itemId);
        await checklist.save();

        res.json({ success: true, message: 'List item deleted successfully', data: checklist });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// Add a single item to an existing checklist
exports.addItemToChecklist = async (req, res) => {
    try {
        const checklistId = req.params.id || req.params.checklistId;
        const { text } = req.body;
        const userId = req.user.userId || req.user.id;

        if (!text || !text.trim()) {
            return res.status(400).json({ success: false, message: 'Item text is required.' });
        }

        const checklist = await Checklist.findById(checklistId);
        if (!checklist) {
            return res.status(404).json({ success: false, message: 'Checklist not found' });
        }

        if (checklist.isFreeze) {
            return res.status(400).json({ success: false, message: 'This checklist is completed and cannot be modified.' });
        }

        const trimmedText = text.trim();
        const lowerText = trimmedText.toLowerCase();

        // Check for duplicate item name within this specific list
        const duplicateExists = checklist.listItems.some(
            item => item.text.trim().toLowerCase() === lowerText
        );

        if (duplicateExists) {
            return res.status(400).json({
                success: false,
                message: `Duplicate item name found in list: "${trimmedText}"`
            });
        }

        // Push new item into the subdocument array
        checklist.listItems.push({
            text: trimmedText,
            completed: false,
            completedBy: null,
            createdBy: userId
        });

        await checklist.save();
        res.status(201).json({ success: true, message: 'Item added successfully', data: checklist });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// Toggle single list item completion status
exports.toggleListItemComplete = async (req, res) => {
    try {
        const { checklistId, itemId } = req.params;
        const { completed } = req.body; // Expects boolean (true/false)
        const userId = req.user.userId || req.user.id;

        const checklist = await Checklist.findById(checklistId);
        if (!checklist) {
            return res.status(404).json({ success: false, message: 'Checklist not found' });
        }

        if (checklist.isFreeze) {
            return res.status(400).json({ success: false, message: 'This checklist is completed and cannot be modified.' });
        }

        const item = checklist.listItems.id(itemId);
        if (!item) {
            return res.status(404).json({ success: false, message: 'List item not found' });
        }

        // Update item completion status and completedBy tracker
        item.completed = completed !== undefined ? completed : !item.completed;
        item.completedBy = item.completed ? userId : null;

        await checklist.save();

        // Re-fetch or populate the updated checklist to return full user details (including fullname virtual)
        const updatedChecklist = await Checklist.findById(checklistId)
            .populate('listItems.completedBy', 'username firstName lastName fullname')
            .populate('listItems.createdBy', 'username firstName lastName fullname')
            .populate('createdBy', 'username firstName lastName fullname');

        res.json({ success: true, message: 'Item status changed successfully', data: updatedChecklist });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// Freeze or unfreeze a checklist
exports.toggleFreezeChecklist = async (req, res) => {
    try {
        const checklistId = req.params.id || req.params.checklistId;
        const { isFreeze } = req.body;
        const userId = req.user.userId || req.user.id;

        const checklist = await Checklist.findById(checklistId);
        if (!checklist) {
            return res.status(404).json({ success: false, message: 'Checklist not found' });
        }

        checklist.isFreeze = isFreeze !== undefined ? isFreeze : !checklist.isFreeze;

        // Stamp frozenBy if freezing, clear if unfreezing
        checklist.frozenBy = checklist.isFreeze ? userId : null;

        await checklist.save();

        const updatedChecklist = await Checklist.findById(checklistId)
            .populate('listItems.completedBy', 'username firstName lastName fullname')
            .populate('listItems.createdBy', 'username firstName lastName fullname')
            .populate('createdBy', 'username firstName lastName fullname')
            .populate('frozenBy', 'username firstName lastName fullname');

        res.json({
            success: true,
            message: `Checklist ${checklist.isFreeze ? 'completed' : 'activate'} successfully`,
            data: updatedChecklist
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};