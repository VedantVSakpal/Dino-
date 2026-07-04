import os
import urllib.request
import sys

def download_file(url, destination):
    print(f"Downloading {url} to {destination}...")
    try:
        def progress_callback(blocks_transferred, block_size, total_size):
            amount_downloaded = blocks_transferred * block_size
            if total_size > 0:
                percent = (amount_downloaded / total_size) * 100
                sys.stdout.write(f"\rProgress: {percent:.1f}% ({amount_downloaded / (1024*1024):.1f} MB of {total_size / (1024*1024):.1f} MB)")
                sys.stdout.flush()
            else:
                sys.stdout.write(f"\rDownloaded: {amount_downloaded / (1024*1024):.1f} MB")
                sys.stdout.flush()

        urllib.request.urlretrieve(url, destination, progress_callback)
        sys.stdout.write("\nFinished!\n")
        sys.stdout.flush()
    except Exception as e:
        print(f"\nError downloading {url}: {e}")
        sys.exit(1)

def main():
    model_url = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx"
    voices_url = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin"

    model_dest = "kokoro-v1.0.onnx"
    voices_dest = "voices-v1.0.bin"

    if not os.path.exists(model_dest):
        download_file(model_url, model_dest)
    else:
        print(f"{model_dest} already exists, skipping.")

    if not os.path.exists(voices_dest):
        download_file(voices_url, voices_dest)
    else:
        print(f"{voices_dest} already exists, skipping.")

    print("All models checked/downloaded successfully!")

if __name__ == "__main__":
    main()
