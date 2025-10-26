import sys
import os
import subprocess
import logging
import json

# Paths
BASE_DIR = os.path.dirname(__file__)
TRANSCRIPTS_DIR = os.path.join(BASE_DIR, '..', 'transcripts')
os.makedirs(TRANSCRIPTS_DIR, exist_ok=True)

# Set up logging
log_file = os.path.join(BASE_DIR, '..', 'transcribe_debug.log')
logging.basicConfig(filename=log_file, level=logging.INFO,
                    format='%(asctime)s - %(levelname)s - %(message)s')

# Ensure audio file is provided
if len(sys.argv) < 2:
    logging.error("No audio file provided")
    print(json.dumps({"error": "No audio file provided"}))
    sys.exit(1)

AUDIO_FILE = sys.argv[1]
logging.info(f"Attempting to transcribe file: {AUDIO_FILE}")

try:
    # Check if audio file exists
    if not os.path.exists(AUDIO_FILE):
        logging.error(f"File {AUDIO_FILE} does not exist")
        print(json.dumps({"error": f"File {AUDIO_FILE} does not exist"}))
        sys.exit(1)

    # Whisper commands
    commands = [
        ["whisper", AUDIO_FILE, "--model", "base", "--language", "en", "--output_format", "txt", "--output_dir", TRANSCRIPTS_DIR],
        ["openai-whisper", AUDIO_FILE, "--model", "base", "--language", "en", "--output_format", "txt", "--output_dir", TRANSCRIPTS_DIR],
        ["python", "-m", "whisper", AUDIO_FILE, "--model", "base", "--language", "en", "--output_format", "txt", "--output_dir", TRANSCRIPTS_DIR]
    ]

    success = False
    for cmd in commands:
        try:
            logging.info(f"Trying command: {' '.join(cmd)}")
            result = subprocess.run(cmd, capture_output=True, text=True)
            if result.returncode == 0:
                success = True
                break
            logging.warning(f"Command failed: {result.stderr.strip()}")
        except Exception as e:
            logging.error(f"Error running command {cmd[0]}: {e}")

    if not success:
        logging.error("All whisper commands failed")
        print(json.dumps({"error": "Transcription failed"}))
        sys.exit(1)

    # Construct transcript file path
    base_name = os.path.splitext(os.path.basename(AUDIO_FILE))[0]
    transcript_file = os.path.join(TRANSCRIPTS_DIR, f"{base_name}.txt")

    if not os.path.exists(transcript_file):
        logging.error(f"Transcript file {transcript_file} not found after whisper run")
        print(json.dumps({"error": f"Transcript file {transcript_file} not found"}))
        sys.exit(1)

    # Read transcript
    with open(transcript_file, "r", encoding="utf-8") as f:
        transcript = f.read().strip()

    if not transcript:
        logging.error(f"Transcript file {transcript_file} is empty")
        print(json.dumps({"error": f"Transcript file {transcript_file} is empty"}))
        sys.exit(1)

    # Output JSON
    print(transcript)
    logging.info(f"Successfully transcribed {AUDIO_FILE} to {transcript_file}")

except Exception as e:
    logging.error(f"Unexpected error: {e}")
    print(json.dumps({"error": f"Unexpected error: {e}"}))
