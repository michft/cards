import { useLocalSearchParams } from 'expo-router';

import { KlondikeGameScreen } from '../../src/screens/klondike-game-screen';

export default function GameRoute() {
  const params = useLocalSearchParams<{ gameId?: string; mode?: string }>();

  return (
    <KlondikeGameScreen
      gameId={params.gameId ?? 'klondike'}
      mode={params.mode === 'resume' ? 'resume' : 'new'}
    />
  );
}
