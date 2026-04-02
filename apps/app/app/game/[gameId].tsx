import { useLocalSearchParams } from 'expo-router';

import { KlondikeGameScreen } from '../../src/screens/klondike-game-screen';
import { SpiderGameScreen } from '../../src/screens/spider-game-screen';

export default function GameRoute() {
  const params = useLocalSearchParams<{ gameId?: string; mode?: string }>();
  const gameId = params.gameId ?? 'klondike';
  const mode = params.mode === 'resume' ? 'resume' : 'new';

  if (gameId === 'spider') {
    return <SpiderGameScreen mode={mode} />;
  }

  return (
    <KlondikeGameScreen
      gameId={gameId}
      mode={mode}
    />
  );
}
