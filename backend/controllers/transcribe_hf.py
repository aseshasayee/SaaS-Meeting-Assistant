#!/usr/bin/env python3
"""
Transcription service using Hugging Face Spaces API
"""
import os
import sys
import requests
import json
from pathlib import Path

def transcribe_with_huggingface(audio_file_path):
    """
    Transcribe audio using your Hugging Face Space
    """
    try:
        # Get HF Space URL from environment variable
        space_url = os.environ.get('HF_SPACE_URL', 'https://aseshasayee1-whisper-transcriber.hf.space')
        if not space_url.endswith('/transcribe'):
            space_url = f"{space_url}/transcribe"
        
        # Get HF token for private spaces
        hf_token = os.environ.get('HUGGINGFACE_TOKEN')
        
        # Check if file exists
        if not os.path.exists(audio_file_path):
            raise FileNotFoundError(f"Audio file not found: {audio_file_path}")
        
        print(f"Transcribing file: {audio_file_path}", file=sys.stderr)
        print(f"Using HF Space URL: {space_url}", file=sys.stderr)
        
        # Prepare headers for private spaces
        headers = {}
        if hf_token:
            headers['Authorization'] = f'Bearer {hf_token}'
        
        # Prepare file for upload
        with open(audio_file_path, 'rb') as f:
            files = {'file': (os.path.basename(audio_file_path), f, 'audio/mpeg')}
            
            # Make request to your HF Space
            response = requests.post(space_url, files=files, headers=headers, timeout=300)
        
        if response.status_code == 200:
            result = response.json()
            if result.get('success'):
                print("Transcription successful", file=sys.stderr)
                return result['transcript'].strip()
            else:
                raise Exception(f"Transcription failed: {result}")
        else:
            raise Exception(f"HTTP {response.status_code}: {response.text}")
            
    except requests.exceptions.Timeout:
        raise Exception("Transcription request timed out")
    except requests.exceptions.RequestException as e:
        raise Exception(f"Request failed: {str(e)}")
    except Exception as e:
        raise Exception(f"Transcription error: {str(e)}")

def main():
    if len(sys.argv) != 2:
        print("Usage: python transcribe_hf.py <audio_file_path>")
        sys.exit(1)
    
    audio_file_path = sys.argv[1]
    
    if not os.path.exists(audio_file_path):
        print(f"Error: Audio file not found: {audio_file_path}")
        sys.exit(1)
    
    try:
        # Transcribe the audio
        transcript = transcribe_with_huggingface(audio_file_path)
        
        # Output the transcript
        print(transcript)
        sys.exit(0)
        
    except Exception as e:
        print(f"Transcription failed: {str(e)}")
        sys.exit(1)

if __name__ == "__main__":
    main()