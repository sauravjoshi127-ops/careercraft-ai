import re
import sys

def check_html(filepath):
    with open(filepath, 'rb') as f:
        raw = f.read()
    
    # Let's decode with latin-1 to see what characters are literally there
    text = raw.decode('latin-1')
    
    # Print lines around 412
    lines = text.split('\n')
    for i in range(400, 415):
        if i < len(lines):
            print(f"{i}: {repr(lines[i])}")

if __name__ == "__main__":
    check_html("cover-letter.html")
