
import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';

export default function App() {
  const [page, setPage] = useState('Home');

  const subjects = [
    'Mathematics',
    'Reasoning',
    'English',
    'General Knowledge',
  ];

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.logo}>🎯 VEER PREP</Text>
      <Text style={styles.subtitle}>
        Your SSC Preparation Partner
      </Text>

      {page === 'Home' ? (
        <>
          <Text style={styles.heading}>
            Welcome, Aspirant! 👋
          </Text>
          <Text style={styles.description}>
            Learn daily. Practice daily. Succeed!
          </Text>

          {subjects.map((subject) => (
            <TouchableOpacity
              key={subject}
              style={styles.card}
              onPress={() => setPage(subject)}
            >
              <Text style={styles.subject}>
                📚 {subject}
              </Text>
              <Text style={styles.small}>
                Tap to explore
              </Text>
            </TouchableOpacity>
          ))}

          <TouchableOpacity
            style={styles.button}
            onPress={() => setPage('Mock Test')}
          >
            <Text style={styles.buttonText}>
              Start Mock Test
            </Text>
          </TouchableOpacity>
        </>
      ) : (
        <View style={styles.card}>
          <Text style={styles.heading}>{page}</Text>
          <Text style={styles.description}>
            Your learning journey starts here!
          </Text>
          <TouchableOpacity
            style={styles.button}
            onPress={() => setPage('Home')}
          >
            <Text style={styles.buttonText}>
              Back to Home
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F0F4FF',
    padding: 20,
    paddingTop: 45,
  },
  logo: {
    fontSize: 29,
    fontWeight: 'bold',
    color: '#2456C5',
    marginBottom: 5,
  },
  subtitle: {
    color: '#555',
    marginBottom: 28,
  },
  heading: {
    fontSize: 23,
    fontWeight: 'bold',
    color: '#17336B',
    marginBottom: 12,
  },
  description: {
    fontSize: 16,
    color: '#555',
    marginBottom: 20,
  },
  card: {
    backgroundColor: 'white',
    padding: 18,
    borderRadius: 14,
    marginBottom: 14,
  },
  subject: {
    fontSize: 17,
    fontWeight: '600',
    color: '#222',
  },
  small: {
    color: '#777',
    marginTop: 5,
  },
  button: {
    backgroundColor: '#2456C5',
    padding: 17,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 25,
  },
  buttonText: {
    color: 'white',
    fontSize: 17,
    fontWeight: 'bold',
  },
});