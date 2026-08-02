const Checklist = require('../models/Checklist');

// Helper to get the io instance from request
const getIo = (req) => req.app.locals.io;

// Helper to format user objects with guaranteed fullname
const formatUser = (user) => {
    if (!user || typeof user !== 'object') return user;
    const plainUser = typeof user.toObject === 'function' ? user.toObject({ virtuals: true }) : { ...user };
    return {
        ...plainUser,
        fullname: plainUser.fullname || `${plainUser.firstName || ''} ${plainUser.lastName || ''}`.trim()
    };
};

// Helper to format checklist document and subdocuments
const formatChecklist = (doc) => {
    if (!doc) return doc;
    const item = typeof doc.toObject === 'function' ? doc.toObject({ virtuals: true }) : { ...doc };
    if (item.createdBy) item.createdBy = formatUser(item.createdBy);
    if (item.frozenBy) item.frozenBy = formatUser(item.frozenBy);
    if (Array.isArray(item.listItems)) {
        item.listItems = item.listItems.map(li => ({
            ...li,
            createdBy: formatUser(li.createdBy),
            completedBy: formatUser(li.completedBy)
        }));
    }
    return item;
};

// 0. Fast dashboard stats — counts only, including a separate count for private checklists
exports.getDashboardStats = async (req, res) => {
    try {
        const userId = req.user.userId || req.user.id;
        const [total, mine, others, privateLists] = await Promise.all([
            // Total public checklists in the system (excludes all private lists)
            Checklist.countDocuments({ isPrivate: { $ne: true } }),
            // Total public lists created by the user
            Checklist.countDocuments({ createdBy: userId, isPrivate: { $ne: true } }),
            // Other users' public checklists
            Checklist.countDocuments({ createdBy: { $ne: userId }, isPrivate: { $ne: true } }),
            // Private checklists created by the authenticated user
            Checklist.countDocuments({ createdBy: userId, isPrivate: true })
        ]);

        res.json({
            success: true,
            data: {
                total,
                mine,
                others,
                privateCount: privateLists
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// 1. Get checklists created ONLY by the authenticated user (includes their private lists)
exports.getMyChecklists = async (req, res) => {
    try {
        const userId = req.user.userId || req.user.id;
        // const lists = await Checklist.find({ createdBy: userId })
        const lists = await Checklist.find({ createdBy: userId, isPrivate: false })
            .populate('createdBy', 'firstName lastName email fullname')
            .populate('frozenBy', 'firstName lastName email fullname')
            .lean();

        const formattedLists = lists.map(formatChecklist);
        res.json({ success: true, count: formattedLists.length, data: formattedLists });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// 2. Get checklists created by OTHER users (must exclude private lists)
exports.getOtherChecklists = async (req, res) => {
    try {
        const userId = req.user.userId || req.user.id;
        const lists = await Checklist.find({
            createdBy: { $ne: userId },
            isPrivate: { $ne: true }
        })
            .populate('createdBy', 'firstName lastName email fullname')
            .populate('frozenBy', 'firstName lastName email fullname')
            .lean();

        const formattedLists = lists.map(formatChecklist);
        res.json({ success: true, count: formattedLists.length, data: formattedLists });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

/// Get ALL public checklists in the system (excludes all private lists)
exports.getAllChecklists = async (req, res) => {
    try {
        const lists = await Checklist.find({ isPrivate: { $ne: true } })
            .sort({ createdAt: -1 })
            .populate('createdBy', 'firstName lastName email fullname')
            .populate('frozenBy', 'firstName lastName email fullname')
            .lean();

        const formattedLists = lists.map(formatChecklist);
        res.json({ success: true, count: formattedLists.length, data: formattedLists });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// Get checklists created by the user that are specifically marked as private
exports.getMyPrivateChecklists = async (req, res) => {
    try {
        const userId = req.user.userId || req.user.id;
        const lists = await Checklist.find({ createdBy: userId, isPrivate: true })
            .populate('createdBy', 'firstName lastName email fullname')
            .populate('frozenBy', 'firstName lastName email fullname')
            .lean();

        const formattedLists = lists.map(formatChecklist);
        res.json({ success: true, count: formattedLists.length, data: formattedLists });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// Get a single checklist by ID with privacy validation
exports.getChecklistById = async (req, res) => {
    try {
        const { list_id } = req.params;
        const userId = req.user.userId || req.user.id;

        const checklist = await Checklist.findById(list_id)
            .populate('listItems.completedBy', 'firstName lastName email fullname')
            .populate('listItems.createdBy', 'firstName lastName email fullname')
            .populate('createdBy', 'firstName lastName email fullname')
            .populate('frozenBy', 'firstName lastName email fullname');

        if (!checklist) {
            return res.status(404).json({ success: false, message: 'Checklist not found' });
        }

        // Prevent unauthorized access to private checklists created by others
        if (checklist.isPrivate && checklist.createdBy._id.toString() !== userId.toString()) {
            return res.status(403).json({ success: false, message: 'Access denied to private checklist' });
        }

        res.json({ success: true, data: formatChecklist(checklist) });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// Create a new checklist (handles 'isPrivate' checkbox value)
exports.createChecklist = async (req, res) => {
    try {
        const { title, listItems, isPrivate } = req.body;
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
                createdBy: userId
            }));
        }

        const newList = new Checklist({
            title: title.trim(),
            listItems: formattedItems,
            createdBy: userId,
            isFreeze: false,
            isPrivate: Boolean(isPrivate)
        });

        await newList.save();

        const populatedList = await Checklist.findById(newList._id)
            .populate('listItems.completedBy', 'firstName lastName email fullname')
            .populate('listItems.createdBy', 'firstName lastName email fullname')
            .populate('createdBy', 'firstName lastName email fullname')
            .populate('frozenBy', 'firstName lastName email fullname');

        const formattedData = formatChecklist(populatedList);

        // Notify all connected clients (Socket.io room filtering can be applied if needed, otherwise standard broadcast)
        getIo(req).emit('checklist:created', { checklistId: newList._id });

        res.status(201).json({ success: true, message: 'List created successfully', data: formattedData });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// Update entire checklist or its full list items array
exports.updateChecklist = async (req, res) => {
    try {
        const checklistId = req.params.id || req.params.checklistId;
        const { title, listItems, isFreeze, isPrivate } = req.body;
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
        if (isPrivate !== undefined) checklist.isPrivate = isPrivate;

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

                const itemCreator = existingItem && existingItem.createdBy ? existingItem.createdBy : userId;

                return {
                    text: textVal,
                    completed: newItem.completed !== undefined ? newItem.completed : (existingItem ? existingItem.completed : false),
                    completedBy: completedBy,
                    createdBy: itemCreator
                };
            });
        }

        await checklist.save();

        const populatedList = await Checklist.findById(checklistId)
            .populate('listItems.completedBy', 'firstName lastName email fullname')
            .populate('listItems.createdBy', 'firstName lastName email fullname')
            .populate('createdBy', 'firstName lastName email fullname')
            .populate('frozenBy', 'firstName lastName email fullname');

        const formattedData = formatChecklist(populatedList);

        getIo(req).emit('checklist:updated', { checklistId });

        res.json({ success: true, message: 'Checklist updated successfully', data: formattedData });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// Delete checklist
exports.deleteChecklist = async (req, res) => {
    try {
        const { id } = req.params;
        await Checklist.findByIdAndDelete(id);

        getIo(req).emit('checklist:deleted', { checklistId: id });

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

        const item = checklist.listItems.id(itemId);
        if (!item) {
            return res.status(404).json({ success: false, message: 'List item not found' });
        }

        checklist.listItems.pull(itemId);
        await checklist.save();

        const populatedList = await Checklist.findById(checklistId)
            .populate('listItems.completedBy', 'firstName lastName email fullname')
            .populate('listItems.createdBy', 'firstName lastName email fullname')
            .populate('createdBy', 'firstName lastName email fullname')
            .populate('frozenBy', 'firstName lastName email fullname');

        const formattedData = formatChecklist(populatedList);

        getIo(req).emit('checklist:item-deleted', { checklistId, itemId });

        res.json({ success: true, message: 'List item deleted successfully', data: formattedData });
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

        const duplicateExists = checklist.listItems.some(
            item => item.text.trim().toLowerCase() === lowerText
        );

        if (duplicateExists) {
            return res.status(400).json({
                success: false,
                message: `Duplicate item name found in list: "${trimmedText}"`
            });
        }

        checklist.listItems.push({
            text: trimmedText,
            completed: false,
            completedBy: null,
            createdBy: userId
        });

        await checklist.save();

        const populatedList = await Checklist.findById(checklistId)
            .populate('listItems.completedBy', 'firstName lastName email fullname')
            .populate('listItems.createdBy', 'firstName lastName email fullname')
            .populate('createdBy', 'firstName lastName email fullname')
            .populate('frozenBy', 'firstName lastName email fullname');

        const formattedData = formatChecklist(populatedList);

        getIo(req).emit('checklist:item-added', { checklistId });

        res.status(201).json({ success: true, message: 'Item added successfully', data: formattedData });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// Toggle single list item completion status
exports.toggleListItemComplete = async (req, res) => {
    try {
        const { checklistId, itemId } = req.params;
        const { completed } = req.body;
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

        item.completed = completed !== undefined ? completed : !item.completed;
        item.completedBy = item.completed ? userId : null;

        await checklist.save();

        const updatedChecklist = await Checklist.findById(checklistId)
            .populate('listItems.completedBy', 'firstName lastName email fullname')
            .populate('listItems.createdBy', 'firstName lastName email fullname')
            .populate('createdBy', 'firstName lastName email fullname')
            .populate('frozenBy', 'firstName lastName email fullname');

        const formattedData = formatChecklist(updatedChecklist);

        getIo(req).emit('checklist:item-toggled', { checklistId, itemId });

        res.json({ success: true, message: 'Item status changed successfully', data: formattedData });
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
        checklist.frozenBy = checklist.isFreeze ? userId : null;

        await checklist.save();

        const updatedChecklist = await Checklist.findById(checklistId)
            .populate('listItems.completedBy', 'firstName lastName email fullname')
            .populate('listItems.createdBy', 'firstName lastName email fullname')
            .populate('createdBy', 'firstName lastName email fullname')
            .populate('frozenBy', 'firstName lastName email fullname');

        const formattedData = formatChecklist(updatedChecklist);

        getIo(req).emit('checklist:frozen', { checklistId, isFreeze: checklist.isFreeze });

        res.json({
            success: true,
            message: `Checklist ${checklist.isFreeze ? 'completed' : 'activate'} successfully`,
            data: formattedData
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};