import logging
import sys

def setup_logger():
    """
    Configures standard Python logging per project criteria (No raw print() allowed).
    """
    logger = logging.getLogger("fastapi_app")
    logger.setLevel(logging.INFO)

    stream_handler = logging.StreamHandler(sys.stdout)
    formatter = logging.Formatter(
        "%(asctime)s - %(levelname)s - %(message)s"
    )
    stream_handler.setFormatter(formatter)
    
    if not logger.handlers:
        logger.addHandler(stream_handler)
        
    return logger
