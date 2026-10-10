import { useLocalSearchParams } from 'expo-router';
import { ActivityIndicator } from 'react-native';

import { useAppModel } from '../../src/state/app-provider';

import { ClockGameScreen } from '../../src/screens/clock-game-screen';
import { FreeCellGameScreen } from '../../src/screens/freecell-game-screen';
import { KlondikeGameScreen } from '../../src/screens/klondike-game-screen';
import { PyramidGameScreen } from '../../src/screens/pyramid-game-screen';
import { SpiderGameScreen } from '../../src/screens/spider-game-screen';

export default function GameRoute() {
  const params = useLocalSearchParams<{ gameId?: string; mode?: string }>();
  const { hydrated } = useAppModel();
  const gameId = params.gameId ?? 'klondike';
  const mode = params.mode === 'resume' ? 'resume' : 'new';
  const gameKey = `${gameId}:${mode}`;

  if (!hydrated) {
    return <ActivityIndicator accessibilityLabel="Loading game" />;
  }

  if (gameId === 'spider') {
    return <SpiderGameScreen key={gameKey} mode={mode} />;
  }

  if (gameId === 'clock') {
    return <ClockGameScreen key={gameKey} mode={mode} />;
  }

  if (gameId === 'freecell') {
    return <FreeCellGameScreen key={gameKey} mode={mode} />;
  }

  if (gameId === 'pyramid') {
    return <PyramidGameScreen key={gameKey} mode={mode} />;
  }

  return (
    <KlondikeGameScreen
      key={gameKey}
      gameId={gameId}
      mode={mode}
    />
  );
}
