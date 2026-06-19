import aio_pika
import json
import os
from shared.config import settings

RABBITMQ_URL = os.getenv("RABBITMQ_URL", "amqp://guest:guest@rabbitmq:5672/")

async def publish_message(queue_name: str, message: dict):
    connection = await aio_pika.connect_robust(RABBITMQ_URL)
    async with connection:
        channel = await connection.channel()
        # Declare queue to ensure it exists
        await channel.declare_queue(queue_name, durable=True)
        
        await channel.default_exchange.publish(
            aio_pika.Message(body=json.dumps(message).encode()),
            routing_key=queue_name,
        )
