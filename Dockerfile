# Use a lightweight Python base image
FROM python:3.11-slim

# Set the working directory inside the container
WORKDIR /app

# Copy the dependency file first (for better caching)
COPY requirements.txt .

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of your app code (including the .db file!)
COPY . .

# Cloud Run injects a PORT environment variable.
# We need to tell the container to listen on that port.
ENV PORT=8080

# The command to run your app using Gunicorn (a production server)
# "app:app" means "look in app.py for the 'app' object"
CMD exec gunicorn --bind :$PORT --workers 1 --threads 8 --timeout 0 app:app