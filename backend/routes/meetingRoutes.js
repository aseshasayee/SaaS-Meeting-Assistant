const express = require('express');
const router = express.Router();
const multer = require('multer');
const { uploadMeeting } = require('../controllers/meetingController');

// Configure multer to store files in uploads folder
const upload = multer({ dest: 'uploads/' });

// POST /api/meetings/upload
router.post('/upload', upload.single('meeting'), uploadMeeting);

module.exports = router;
