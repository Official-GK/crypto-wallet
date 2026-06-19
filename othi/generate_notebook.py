import os
import json

def generate_notebook(backend_dir, output_file):
    notebook = {
        "cells": [
            {
                "cell_type": "markdown",
                "metadata": {},
                "source": [
                    "# CryptoVault Full Backend Source Code\n",
                    "This notebook contains the complete source code for the CryptoVault backend microservices. Each cell corresponds to a specific file in the repository."
                ]
            }
        ],
        "metadata": {
            "kernelspec": {
                "display_name": "Python 3",
                "language": "python",
                "name": "python3"
            },
            "language_info": {
                "name": "python",
                "version": "3.10"
            }
        },
        "nbformat": 4,
        "nbformat_minor": 4
    }

    # Walk through the backend directory
    for root, dirs, files in os.walk(backend_dir):
        # Exclude pycache and virtual environments
        if '__pycache__' in root or 'venv' in root or '.pytest_cache' in root:
            continue
            
        for file in files:
            if file.endswith('.py'):
                file_path = os.path.join(root, file)
                rel_path = os.path.relpath(file_path, start=os.path.dirname(backend_dir))
                
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        code_content = f.read()
                        
                    # Add Markdown cell for the filename
                    notebook['cells'].append({
                        "cell_type": "markdown",
                        "metadata": {},
                        "source": [f"### File: `{rel_path}`"]
                    })
                    
                    # Add Code cell with the file content
                    notebook['cells'].append({
                        "cell_type": "code",
                        "execution_count": None,
                        "metadata": {},
                        "outputs": [],
                        "source": [line + '\n' for line in code_content.split('\n')]
                    })
                except Exception as e:
                    print(f"Error reading {file_path}: {e}")

    # Write the notebook
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(notebook, f, indent=1)
        
    print(f"Successfully generated {output_file} with all backend code.")

if __name__ == "__main__":
    backend_path = "/Users/gauravkulkarni/Desktop/crypto_currency_wallet_system_design prj/backend"
    output_path = "/Users/gauravkulkarni/Desktop/crypto_currency_wallet_system_design prj/othi/CryptoVault_Implementation.ipynb"
    generate_notebook(backend_path, output_path)
