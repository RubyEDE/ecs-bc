import { SystemId, EventHandler, SystemEvent, EmitOptions, SubscriptionId } from '../types';

/**
 * Event subscription information
 */
interface EventSubscription {
  id: SubscriptionId;
  systemId: SystemId;
  eventType: string;
  handler: EventHandler;
  createdAt: number;
}

/**
 * Event system for cross-system communication
 */
export class EventSystem {
  private subscriptions = new Map<string, EventSubscription[]>();
  private systemSubscriptions = new Map<SystemId, Set<SubscriptionId>>();
  private eventHistory = new Map<string, SystemEvent[]>();
  private maxEventHistory = 1000;
  private nextSubscriptionId = 1;

  /**
   * Subscribe to an event type
   */
  subscribe(
    systemId: SystemId,
    eventType: string,
    handler: EventHandler
  ): SubscriptionId {
    const subscriptionId = `sub_${this.nextSubscriptionId++}`;

    const subscription: EventSubscription = {
      id: subscriptionId,
      systemId,
      eventType,
      handler,
      createdAt: Date.now(),
    };

    // Add to event type subscriptions
    if (!this.subscriptions.has(eventType)) {
      this.subscriptions.set(eventType, []);
    }
    this.subscriptions.get(eventType)!.push(subscription);

    // Track system subscriptions
    if (!this.systemSubscriptions.has(systemId)) {
      this.systemSubscriptions.set(systemId, new Set());
    }
    this.systemSubscriptions.get(systemId)!.add(subscriptionId);

    return subscriptionId;
  }

  /**
   * Unsubscribe from an event
   */
  unsubscribe(subscriptionId: SubscriptionId): boolean {
    // Find and remove subscription
    for (const [eventType, subscriptions] of this.subscriptions) {
      const index = subscriptions.findIndex(sub => sub.id === subscriptionId);
      if (index >= 0) {
        const subscription = subscriptions[index];
        subscriptions.splice(index, 1);

        // Remove from system tracking
        const systemSubs = this.systemSubscriptions.get(subscription.systemId);
        if (systemSubs) {
          systemSubs.delete(subscriptionId);
          if (systemSubs.size === 0) {
            this.systemSubscriptions.delete(subscription.systemId);
          }
        }

        // Clean up empty event type
        if (subscriptions.length === 0) {
          this.subscriptions.delete(eventType);
        }

        return true;
      }
    }

    return false;
  }

  /**
   * Emit an event
   */
  emit(
    emitterSystemId: SystemId,
    eventType: string,
    data: any,
    options: EmitOptions = {}
  ): void {
    const event: SystemEvent = {
      type: eventType,
      data,
      emitter: emitterSystemId,
      timestamp: Date.now(),
      metadata: options.broadcast ? { broadcast: true } : undefined,
    };

    // Store in event history
    this.addToHistory(eventType, event);

    const subscriptions = this.subscriptions.get(eventType) || [];

    // Filter subscriptions based on targeting options
    const targetSubscriptions = this.filterTargetSubscriptions(
      subscriptions,
      emitterSystemId,
      options
    );

    // Deliver event to subscribers
    for (const subscription of targetSubscriptions) {
      try {
        subscription.handler(event);
      } catch (error) {
        console.error(
          `Error in event handler for system '${subscription.systemId}':`,
          error
        );
      }
    }
  }

  /**
   * Get subscriptions for a system
   */
  getSystemSubscriptions(systemId: SystemId): EventSubscription[] {
    const subscriptionIds = this.systemSubscriptions.get(systemId);
    if (!subscriptionIds) return [];

    const subscriptions: EventSubscription[] = [];
    for (const [, subs] of this.subscriptions) {
      for (const sub of subs) {
        if (subscriptionIds.has(sub.id)) {
          subscriptions.push(sub);
        }
      }
    }

    return subscriptions;
  }

  /**
   * Get all subscribers for an event type
   */
  getEventSubscribers(eventType: string): SystemId[] {
    const subscriptions = this.subscriptions.get(eventType) || [];
    return subscriptions.map(sub => sub.systemId);
  }

  /**
   * Get event history for an event type
   */
  getEventHistory(eventType: string, limit: number = 100): SystemEvent[] {
    const history = this.eventHistory.get(eventType) || [];
    return history.slice(-limit);
  }

  /**
   * Get all events emitted by a system
   */
  getSystemEvents(systemId: SystemId, limit: number = 100): SystemEvent[] {
    const allEvents: SystemEvent[] = [];
    
    for (const events of this.eventHistory.values()) {
      for (const event of events) {
        if (event.emitter === systemId) {
          allEvents.push(event);
        }
      }
    }

    // Sort by timestamp (most recent first)
    allEvents.sort((a, b) => b.timestamp - a.timestamp);
    return allEvents.slice(0, limit);
  }

  /**
   * Remove all subscriptions for a system
   */
  removeSystemSubscriptions(systemId: SystemId): void {
    const subscriptionIds = this.systemSubscriptions.get(systemId);
    if (!subscriptionIds) return;

    // Remove each subscription
    for (const subscriptionId of subscriptionIds) {
      this.unsubscribe(subscriptionId);
    }
  }

  /**
   * Get event system statistics
   */
  getStats(): {
    totalSubscriptions: number;
    totalEventTypes: number;
    systemsWithSubscriptions: number;
    totalEventsInHistory: number;
    eventTypesWithHistory: number;
  } {
    let totalSubscriptions = 0;
    for (const subs of this.subscriptions.values()) {
      totalSubscriptions += subs.length;
    }

    let totalEventsInHistory = 0;
    for (const events of this.eventHistory.values()) {
      totalEventsInHistory += events.length;
    }

    return {
      totalSubscriptions,
      totalEventTypes: this.subscriptions.size,
      systemsWithSubscriptions: this.systemSubscriptions.size,
      totalEventsInHistory,
      eventTypesWithHistory: this.eventHistory.size,
    };
  }

  /**
   * Clear event history for an event type
   */
  clearEventHistory(eventType: string): void {
    this.eventHistory.delete(eventType);
  }

  /**
   * Clear all event history
   */
  clearAllEventHistory(): void {
    this.eventHistory.clear();
  }

  /**
   * Get detailed event type information
   */
  getEventTypeInfo(eventType: string): {
    subscribers: SystemId[];
    recentEvents: SystemEvent[];
    totalEventsEmitted: number;
    averageEventsPerDay: number;
  } {
    const subscribers = this.getEventSubscribers(eventType);
    const recentEvents = this.getEventHistory(eventType, 50);
    const totalEventsEmitted = (this.eventHistory.get(eventType) || []).length;
    
    // Calculate average events per day (rough estimate)
    const averageEventsPerDay = this.calculateAverageEventsPerDay(eventType);

    return {
      subscribers,
      recentEvents,
      totalEventsEmitted,
      averageEventsPerDay,
    };
  }

  /**
   * Filter subscriptions based on targeting options
   */
  private filterTargetSubscriptions(
    subscriptions: EventSubscription[],
    emitterSystemId: SystemId,
    options: EmitOptions
  ): EventSubscription[] {
    let filtered = subscriptions;

    // Target specific systems
    if (options.targetSystems && options.targetSystems.length > 0) {
      filtered = filtered.filter(sub => 
        options.targetSystems!.includes(sub.systemId)
      );
    }

    // Exclude emitter if not broadcast
    if (!options.broadcast) {
      filtered = filtered.filter(sub => sub.systemId !== emitterSystemId);
    }

    return filtered;
  }

  /**
   * Add event to history
   */
  private addToHistory(eventType: string, event: SystemEvent): void {
    if (!this.eventHistory.has(eventType)) {
      this.eventHistory.set(eventType, []);
    }

    const history = this.eventHistory.get(eventType)!;
    history.push(event);

    // Keep only recent events to prevent memory issues
    if (history.length > this.maxEventHistory) {
      history.splice(0, history.length - this.maxEventHistory);
    }
  }

  /**
   * Calculate average events per day for an event type
   */
  private calculateAverageEventsPerDay(eventType: string): number {
    const events = this.eventHistory.get(eventType) || [];
    if (events.length === 0) return 0;

    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const recentEvents = events.filter(event => event.timestamp > oneDayAgo);

    return recentEvents.length;
  }

  /**
   * Clear all subscriptions and history
   */
  clear(): void {
    this.subscriptions.clear();
    this.systemSubscriptions.clear();
    this.eventHistory.clear();
    this.nextSubscriptionId = 1;
  }
}

/**
 * Global event system instance
 */
export const eventSystem = new EventSystem(); 