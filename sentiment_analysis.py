import os

# Disable XLA and force CPU
os.environ["TF_XLA_FLAGS"] = "--tf_xla_enable_xla_devices=false"
os.environ["CUDA_VISIBLE_DEVICES"] = "-1"
os.environ["TF_ENABLE_ONEDNN_OPTS"] = "0"

# Optional: suppress Apple Metal logs (just to keep output clean)
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "2"

import pandas as pd
import re
import string
import joblib
import tensorflow as tf
tf.config.set_visible_devices([], 'GPU')
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import Embedding, GlobalAveragePooling1D, Dense, Dropout
from tensorflow.keras.preprocessing.text import Tokenizer
from tensorflow.keras.preprocessing.sequence import pad_sequences
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder



# --- Configuration Parameters ---
# Maximum number of words to keep in the vocabulary
MAX_NUM_WORDS = 20000
# Maximum length of text sequences
MAX_SEQUENCE_LENGTH = 100
# Dimension of the word embeddings
EMBEDDING_DIM = 100
# Batch size for training
BATCH_SIZE = 512
# Number of training epochs
EPOCHS = 20
# Path to the dataset (you'll need to provide this CSV file)
DATASET_PATH = 'sentiment140.csv' # Make sure this file exists in your project or update the path

# --- Text Preprocessing Functions ---
def remove_urls(text):
    """Removes URLs from the text."""
    url_pattern = re.compile(r'https?://\S+|www\.\S+')
    return url_pattern.sub(r'', text)

def remove_html(text):
    """Removes HTML tags from the text."""
    html_pattern = re.compile(r'<.*?>')
    return html_pattern.sub(r'', text)

def remove_punctuation(text):
    """Removes punctuation from the text."""
    return text.translate(str.maketrans('', '', string.punctuation))

def remove_extra_spaces(text):
    """Removes extra spaces from the text."""
    return re.sub(r'\s+', ' ', text).strip()

def preprocess_text(text):
    """Applies all preprocessing steps to the text."""
    text = text.lower() # Convert to lowercase
    text = remove_urls(text)
    text = remove_html(text)
    text = remove_punctuation(text)
    text = remove_extra_spaces(text)
    return text

# --- Main Training Function ---
def train_and_save_sentiment_model():
    """
    Loads data, preprocesses it, trains a sentiment analysis model,
    and saves the model, tokenizer, and label encoder.
    """
    print(f"Loading dataset from {DATASET_PATH}...")
    try:
        # Load the dataset. Assuming it's a CSV without headers, using specific columns.
        # This dataset typically contains 6 fields:
        # 0 - the polarity of the tweet (0 = negative, 2 = neutral, 4 = positive)
        # 1 - the id of the tweet (2087)
        # 2 - the date of the tweet (Sat May 16 23:58:15 UTC 2009)
        # 3 - the query (lyx). If there is no query, then this value is NO_QUERY.
        # 4 - the user that tweeted (robotickilldozer)
        # 5 - the text of the tweet (Lyx is cool)
        df = pd.read_csv(DATASET_PATH, encoding='latin-1', header=None)
        # Select only the relevant columns: polarity (0) and text (5)
        df = df[[0, 5]]
        df.columns = ['sentiment', 'text']
        print(f"Dataset loaded. Shape: {df.shape}")
        print("Sample data:")
        print(df.head())

        # Map sentiment labels: 0 -> negative, 2 -> neutral, 4 -> positive
        # This dataset usually has 0 for negative, 2 for neutral, 4 for positive.
        # We'll map them to 'negative', 'neutral', 'positive' strings.
        df['sentiment'] = df['sentiment'].replace({0: 'negative', 2: 'neutral', 4: 'positive'})
        print("\nSentiment distribution:")
        print(df['sentiment'].value_counts())

    except FileNotFoundError:
        print(f"Error: Dataset not found at {DATASET_PATH}. Please download it or update the path.")
        print("You can usually find 'sentiment140.csv' by searching online.")
        return
    except Exception as e:
        print(f"Error loading or processing dataset: {e}")
        return

    print("Preprocessing text data...")
    df['text'] = df['text'].apply(preprocess_text)
    print("Text preprocessing complete.")
    print("Sample preprocessed text:")
    print(df['text'].head())

    # Split data into training and testing sets
    X_train, X_test, y_train, y_test = train_test_split(
        df['text'], df['sentiment'], test_size=0.2, random_state=42, stratify=df['sentiment']
    )
    print(f"\nTraining samples: {len(X_train)}, Test samples: {len(X_test)}")

    # Initialize and fit tokenizer
    print("Initializing and fitting tokenizer...")
    tokenizer = Tokenizer(num_words=MAX_NUM_WORDS, oov_token="<unk>")
    tokenizer.fit_on_texts(X_train)
    print(f"Tokenizer vocabulary size: {len(tokenizer.word_index)}")

    # Convert text to sequences and pad them
    print("Converting text to sequences and padding...")
    X_train_seq = tokenizer.texts_to_sequences(X_train)
    X_test_seq = tokenizer.texts_to_sequences(X_test)

    X_train_padded = pad_sequences(X_train_seq, maxlen=MAX_SEQUENCE_LENGTH)
    X_test_padded = pad_sequences(X_test_seq, maxlen=MAX_SEQUENCE_LENGTH)
    print("Text to sequences and padding complete.")

    # Encode labels
    print("Encoding labels...")
    label_encoder = LabelEncoder()
    y_train_encoded = label_encoder.fit_transform(y_train)
    y_test_encoded = label_encoder.transform(y_test)
    print(f"Label classes: {label_encoder.classes_}")

    # Build the Keras model
    print("Building Keras model...")
    model = Sequential([
        Embedding(MAX_NUM_WORDS, EMBEDDING_DIM, input_length=MAX_SEQUENCE_LENGTH),
        GlobalAveragePooling1D(), # Averages the embeddings of all words in the sequence
        Dense(64, activation='relu'),
        Dropout(0.5), # Dropout for regularization
        Dense(32, activation='relu'),
        Dropout(0.5),
        Dense(len(label_encoder.classes_), activation='softmax') # Output layer for 3 classes (negative, neutral, positive)
    ])

    model.compile(optimizer='adam', loss='sparse_categorical_crossentropy', metrics=['accuracy'])
    model.summary()

    # Train the model
    print("\nTraining the model...")
    history = model.fit(
        X_train_padded, y_train_encoded,
        epochs=EPOCHS,
        batch_size=BATCH_SIZE,
        validation_data=(X_test_padded, y_test_encoded),
        verbose=1
    )
    print("Model training complete.")

    # Evaluate the model
    loss, accuracy = model.evaluate(X_test_padded, y_test_encoded, verbose=0)
    print(f"\nModel Evaluation - Loss: {loss:.4f}, Accuracy: {accuracy:.4f}")

    # Save the trained model, tokenizer, and label encoder
    print("Saving model, tokenizer, and label encoder...")
    model.save('sentiment_model.h5')
    joblib.dump(tokenizer, 'tokenizer.joblib')
    joblib.dump(label_encoder, 'label_encoder.joblib')
    print("Model, tokenizer, and label encoder saved successfully.")

if __name__ == '__main__':
    train_and_save_sentiment_model()